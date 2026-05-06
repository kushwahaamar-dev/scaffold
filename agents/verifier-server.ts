/**
 * Scaffold verifier API — x402-paywalled, Bedrock-judged.
 *
 *   POST /score        →  402 Payment Required (x402)
 *                          Pay 0.001 USDC on Base via x402 Facilitator,
 *                          retry with X-PAYMENT header.
 *                          Body: { spec, artifact_url, job_id?, checkpoint_ids? }
 *                          Returns: { results: [{ checkpoint_id, score_bps, evidence }] }
 *                          Side effect (if SETTLE_ON_CHAIN=1 and job_id provided):
 *                          calls release_streamed on Base for any forward progress.
 *
 *   GET  /pricing      →  free; returns the price catalog for agent discovery
 *                          (the "economic reasoning" surface).
 *
 *   GET  /healthz      →  free liveness probe.
 *
 * Deploy this behind API Gateway → Lambda or run locally. The shape is identical.
 */
import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import { paymentMiddleware, type Network } from 'x402-express';
import type { Tool } from '@aws-sdk/client-bedrock-runtime';

import { bedrockClient, bedrockToolCall, defaultBedrockModel } from './lib/bedrock.js';
import {
  SCAFFOLD_ESCROW_ABI,
  buildClients,
  getEscrowAddress,
  jobIdFor,
} from './lib/chain.js';
import type { Address } from 'viem';

type ScoreResult = { checkpoint_id: string; score_bps: number; evidence: string };

type ScoreRequestBody = {
  spec: {
    title: string;
    checkpoints: Array<{ id: string; title: string; weight_bps: number; rubric: string }>;
  };
  artifact_url?: string;
  artifact?: string;
  job_id?: `0x${string}`;
  buyer?: Address;
  nonce?: string;
};

const SCORE_TOOL: Tool = {
  toolSpec: {
    name: 'submit_scores',
    description:
      'Score every checkpoint of the spec against the supplied artifact. score_bps is 0..=10000.',
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                checkpoint_id: { type: 'string' },
                score_bps: { type: 'integer', minimum: 0, maximum: 10000 },
                evidence: { type: 'string' },
              },
              required: ['checkpoint_id', 'score_bps', 'evidence'],
            },
          },
        },
        required: ['results'],
      },
    },
  },
};

async function fetchArtifact(body: ScoreRequestBody): Promise<string> {
  if (body.artifact) return body.artifact.slice(0, 60_000);
  if (body.artifact_url) {
    const r = await fetch(body.artifact_url);
    if (!r.ok) throw new Error(`artifact fetch ${r.status}`);
    return (await r.text()).slice(0, 60_000);
  }
  throw new Error('Provide artifact or artifact_url in the request body');
}

async function scoreWithBedrock(spec: ScoreRequestBody['spec'], artifact: string): Promise<ScoreResult[]> {
  const sys = [
    'You are a deterministic verification judge for the Scaffold protocol.',
    'You receive a structured spec with per-checkpoint rubrics and an artifact.',
    'Score each checkpoint by the rubric. Score 0 if the rubric is not met.',
    'Score 10000 only if the artifact unambiguously satisfies the rubric.',
    'Use intermediate scores for partial credit. Never speculate beyond the artifact.',
    'Return scores by calling submit_scores exactly once.',
  ].join(' ');

  const user = `Spec: ${JSON.stringify(spec)}\n---\nArtifact:\n${artifact}`;

  const out = await bedrockToolCall<{ results: ScoreResult[] }>({
    client: bedrockClient(),
    modelId: defaultBedrockModel(),
    system: sys,
    user,
    tool: SCORE_TOOL,
  });
  return out.results;
}

async function maybeSettleOnChain(body: ScoreRequestBody, scores: ScoreResult[]): Promise<string[]> {
  if (process.env.SETTLE_ON_CHAIN !== '1') return [];
  if (!body.job_id && (!body.buyer || !body.nonce)) return [];

  const { pub, wal, account } = buildClients('ARBITER_PRIVATE_KEY');
  const escrow = getEscrowAddress();
  const jobId = body.job_id ?? jobIdFor(body.buyer!, BigInt(body.nonce!));

  // Read current state to determine forward-progress deltas.
  const job = await pub.readContract({
    address: escrow, abi: SCAFFOLD_ESCROW_ABI, functionName: 'getJob', args: [jobId],
  });
  const checkpointCount = Number(job[8]);
  const txs: string[] = [];
  for (const s of scores) {
    const idx = body.spec.checkpoints.findIndex((c) => c.id === s.checkpoint_id);
    if (idx < 0 || idx >= checkpointCount) continue;
    const [weight, already] = await pub.readContract({
      address: escrow, abi: SCAFFOLD_ESCROW_ABI, functionName: 'getCheckpointProgress', args: [jobId, idx],
    });
    const target = Math.min(s.score_bps, Number(weight));
    if (target <= Number(already)) continue;
    try {
      const hash = await wal.writeContract({
        address: escrow, abi: SCAFFOLD_ESCROW_ABI, functionName: 'releaseStreamed',
        args: [jobId, idx, target], chain: pub.chain, account,
      });
      txs.push(hash);
    } catch (e) {
      console.warn(`[verifier] release_streamed cp[${idx}] failed: ${(e as Error).message}`);
    }
  }
  return txs;
}

function pickNetwork(): Network {
  const v = (process.env.X402_NETWORK ?? 'base-sepolia') as Network;
  return v;
}

export function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true, service: 'scaffold-verifier', model: defaultBedrockModel() });
  });

  // Free pricing catalog so agents can discover service economics before paying.
  app.get('/pricing', (_req: Request, res: Response) => {
    res.status(200).json({
      service: 'scaffold-verifier',
      paywalled_endpoints: {
        '/score': {
          price_usdc: '0.001',
          network: pickNetwork(),
          description: 'AI-judged structured scoring of an artifact against a spec.',
          settles_on_chain: process.env.SETTLE_ON_CHAIN === '1',
        },
      },
      facilitator: process.env.X402_FACILITATOR ?? 'https://x402.org/facilitator',
      pay_to: process.env.X402_PAY_TO,
    });
  });

  // x402 paywall: anything matched here returns 402 + payment requirements
  // until the client retries with a valid X-PAYMENT header that the
  // facilitator settles on Base.
  if (process.env.X402_PAY_TO) {
    app.use(
      paymentMiddleware(
        process.env.X402_PAY_TO as `0x${string}`,
        {
          'POST /score': {
            price: '$0.001',
            network: pickNetwork(),
            config: { description: 'Structured AI scoring of an artifact (Bedrock-judged).' },
          },
        },
        { url: (process.env.X402_FACILITATOR ?? 'https://x402.org/facilitator') as `${string}://${string}` },
      ),
    );
  }

  app.post('/score', async (req: Request, res: Response) => {
    const body = req.body as ScoreRequestBody;
    if (!body?.spec) {
      return res.status(400).json({ error: 'missing spec' });
    }
    try {
      const artifact = await fetchArtifact(body);
      const scores = await scoreWithBedrock(body.spec, artifact);
      const txs = await maybeSettleOnChain(body, scores);
      res.status(200).json({ results: scores, settlement_txs: txs });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return app;
}

if (process.env.NODE_ENV !== 'test' && (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('verifier-server.ts'))) {
  const port = Number(process.env.PORT ?? 4021);
  buildApp().listen(port, () => {
    console.log(`[verifier] listening on :${port} · x402 pay-to=${process.env.X402_PAY_TO ?? '(unset)'} · network=${pickNetwork()}`);
  });
}
