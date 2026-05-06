import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import BN from 'bn.js';
import { FunctionCallingConfigMode, GoogleGenAI, Type, type FunctionDeclaration } from '@google/genai';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';

import { buildProgram, escrowPda, loadKeypair, type EscrowAccount } from './lib/program.js';

type Spec = {
  title: string;
  checkpoints: Array<{
    id: string;
    title: string;
    weight_bps: number;
    verifier_type: string;
    rubric: string;
  }>;
};

type ScoreResult = { checkpoint_id: string; score_bps: number; evidence: string };

const SCORE_FN: FunctionDeclaration = {
  name: 'submit_scores',
  description:
    'Score every checkpoint of the spec against the supplied artifact. score_bps is 0..=10000 representing the share of that checkpoint deemed satisfied by the artifact.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      results: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            checkpoint_id: { type: Type.STRING },
            score_bps: { type: Type.INTEGER },
            evidence: { type: Type.STRING },
          },
          required: ['checkpoint_id', 'score_bps', 'evidence'],
        },
      },
    },
    required: ['results'],
  },
};

async function scoreArtifact(
  client: GoogleGenAI,
  model: string,
  spec: Spec,
  artifact: string,
): Promise<ScoreResult[]> {
  const sys = [
    'You are a deterministic verification judge for the Scaffold protocol.',
    'You receive a structured spec with per-checkpoint rubrics and an artifact.',
    'Your only job is to score each checkpoint by the rubric. Score 0 if the rubric is not met.',
    'Score 10000 only if the artifact unambiguously satisfies the rubric.',
    'Use intermediate scores for partial credit. Never speculate beyond the artifact.',
    'Return scores by calling submit_scores exactly once.',
  ].join(' ');

  const user = [
    `Spec: ${JSON.stringify(spec)}`,
    '---',
    `Artifact (verbatim, do not interpret beyond what is shown):\n${artifact.slice(0, 60_000)}`,
  ].join('\n');

  const resp = await client.models.generateContent({
    model,
    contents: user,
    config: {
      systemInstruction: sys,
      tools: [{ functionDeclarations: [SCORE_FN] }],
      toolConfig: {
        functionCallingConfig: { mode: FunctionCallingConfigMode.ANY, allowedFunctionNames: [SCORE_FN.name!] },
      },
    },
  });

  const calls = resp.functionCalls ?? [];
  const call = calls.find((c) => c.name === SCORE_FN.name);
  if (!call) {
    throw new Error('Verifier model did not return a function call');
  }
  const input = call.args as { results?: ScoreResult[] };
  if (!input?.results) {
    throw new Error('Verifier function call missing results array');
  }
  return input.results;
}

function readArtifact(pathOrUrl: string): Promise<string> {
  if (/^https?:\/\//.test(pathOrUrl)) {
    return fetch(pathOrUrl).then((r) => r.text());
  }
  return Promise.resolve(readFileSync(pathOrUrl, 'utf8'));
}

async function main() {
  const required = ['GEMINI_API_KEY', 'ARBITER_KEYPAIR', 'BUYER_PUBKEY', 'NONCE', 'ARTIFACT'];
  for (const k of required) {
    if (!process.env[k]) {
      throw new Error(`Missing required env var: ${k}`);
    }
  }

  const rpcUrl = process.env.RPC_URL ?? 'https://api.devnet.solana.com';
  const specPath = process.env.SPEC ?? 'agents/spec.example.json';
  const artifactPath = process.env.ARTIFACT!;
  const tickMs = Number(process.env.TICK_MS ?? 30_000);
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-pro';

  const arbiter = loadKeypair(process.env.ARBITER_KEYPAIR!);
  const buyer = new PublicKey(process.env.BUYER_PUBKEY!);
  const nonce = new BN(process.env.NONCE!, 10);

  const { program } = buildProgram(rpcUrl, arbiter);
  const [escrow] = escrowPda(program.programId, buyer, nonce);

  const spec: Spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  console.log(`[verifier] arbiter=${arbiter.publicKey.toBase58()}`);
  console.log(`[verifier] escrow=${escrow.toBase58()}`);
  console.log(`[verifier] tick=${tickMs}ms model=${model}`);

  for (;;) {
    let acct: EscrowAccount;
    try {
      acct = await program.account.escrow.fetch(escrow);
    } catch (e) {
      console.warn('[verifier] escrow not found yet —', (e as Error).message);
      await sleep(tickMs);
      continue;
    }
    if (acct.finalized) {
      console.log('[verifier] escrow finalized — exiting');
      return;
    }
    if (!acct.deposited || acct.paused) {
      console.log(`[verifier] not active (deposited=${acct.deposited} paused=${acct.paused}) — sleep`);
      await sleep(tickMs);
      continue;
    }

    let artifact: string;
    try {
      artifact = await readArtifact(artifactPath);
    } catch (e) {
      console.warn('[verifier] artifact unavailable —', (e as Error).message);
      await sleep(tickMs);
      continue;
    }

    let scores: ScoreResult[];
    try {
      scores = await scoreArtifact(gemini, model, spec, artifact);
    } catch (e) {
      console.warn('[verifier] score failed —', (e as Error).message);
      await sleep(tickMs);
      continue;
    }

    for (const s of scores) {
      const idx = spec.checkpoints.findIndex((c) => c.id === s.checkpoint_id);
      if (idx === -1) {
        console.warn(`[verifier] unknown checkpoint id ${s.checkpoint_id}`);
        continue;
      }
      const weight = acct.weights[idx];
      const already = acct.bpsReleasedPerCp[idx];
      const target = Math.min(s.score_bps, weight);
      if (target <= already) {
        continue;
      }
      const workerAta = getAssociatedTokenAddressSync(acct.mint, acct.worker, false);
      const vault = getAssociatedTokenAddressSync(acct.mint, escrow, true);
      try {
        const sig = await program.methods
          .releaseStreamed(idx, target)
          .accountsPartial({
            arbiter: arbiter.publicKey,
            escrow,
            vault,
            worker: acct.worker,
            workerAta,
            mint: acct.mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        console.log(
          `[verifier] cp[${idx}] ${s.checkpoint_id}: ${already}→${target} bps · ${s.evidence.slice(0, 80)} · sig=${sig.slice(0, 10)}…`,
        );
      } catch (e) {
        console.warn(`[verifier] release_streamed cp[${idx}] failed —`, (e as Error).message);
      }
    }

    await sleep(tickMs);
  }
}

main().catch((e) => {
  console.error('[verifier] fatal:', e);
  process.exit(1);
});
