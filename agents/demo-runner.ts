import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import BN from 'bn.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { createHash } from 'node:crypto';

import { buildProgram, escrowPda, loadKeypair } from './lib/program.js';

type Spec = {
  title: string;
  checkpoints: Array<{ id: string; weight_bps: number }>;
};

async function ensureAta(
  program: ReturnType<typeof buildProgram>['program'],
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner, false);
  const conn = program.provider.connection;
  const info = await conn.getAccountInfo(ata);
  if (info) return ata;
  const ix = createAssociatedTokenAccountInstruction(payer, ata, owner, mint);
  const tx = new Transaction().add(ix);
  const latest = await conn.getLatestBlockhash();
  tx.recentBlockhash = latest.blockhash;
  tx.feePayer = payer;
  await program.provider.sendAndConfirm!(tx);
  return ata;
}

async function main() {
  const required = [
    'BUYER_KEYPAIR',
    'WORKER_KEYPAIR',
    'ARBITER_KEYPAIR',
    'USDC_MINT',
  ];
  for (const k of required) {
    if (!process.env[k]) throw new Error(`Missing env var ${k}`);
  }

  const rpcUrl = process.env.RPC_URL ?? 'https://api.devnet.solana.com';
  const specPath = process.env.SPEC ?? 'agents/spec.example.json';
  const budgetUsdc = Number(process.env.BUDGET_USDC ?? '25');
  const nonce = new BN(process.env.NONCE ?? Math.floor(Date.now() / 1000).toString(), 10);

  const buyer = loadKeypair(process.env.BUYER_KEYPAIR!);
  const worker = loadKeypair(process.env.WORKER_KEYPAIR!);
  const arbiter = loadKeypair(process.env.ARBITER_KEYPAIR!);
  const mint = new PublicKey(process.env.USDC_MINT!);
  const spec: Spec = JSON.parse(readFileSync(specPath, 'utf8'));

  const buyerCtx = buildProgram(rpcUrl, buyer);
  const arbiterCtx = buildProgram(rpcUrl, arbiter);

  const programId = buyerCtx.program.programId;
  const [escrow] = escrowPda(programId, buyer.publicKey, nonce);
  const vault = getAssociatedTokenAddressSync(mint, escrow, true);

  const weights = new Array<number>(16).fill(0);
  for (let i = 0; i < spec.checkpoints.length; i++) {
    weights[i] = spec.checkpoints[i].weight_bps;
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum !== 10_000) {
    throw new Error(`Spec weights sum to ${sum}, expected 10000`);
  }

  const deadline = new BN(Math.floor(Date.now() / 1000) + 6 * 3600);
  const specHash = createHash('sha256').update(JSON.stringify(spec)).digest();

  console.log(`[demo] escrow=${escrow.toBase58()} nonce=${nonce.toString()}`);
  console.log(`[demo] worker=${worker.publicKey.toBase58()}`);
  console.log(`[demo] arbiter=${arbiter.publicKey.toBase58()}`);

  // ── Act 0 — initialize + deposit ────────────────────────────────────
  console.log('[demo] act 0 · initialize + deposit');
  await buyerCtx.program.methods
    .initializeEscrow(
      nonce,
      new BN(Math.round(budgetUsdc * 1_000_000)),
      spec.checkpoints.length,
      weights,
      deadline,
      8000,
      Array.from(specHash),
    )
    .accountsPartial({
      buyer: buyer.publicKey,
      worker: worker.publicKey,
      arbiter: arbiter.publicKey,
      mint,
      escrow,
      vault,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const buyerAta = await ensureAta(buyerCtx.program, buyer.publicKey, buyer.publicKey, mint);
  const workerAta = await ensureAta(buyerCtx.program, buyer.publicKey, worker.publicKey, mint);

  await buyerCtx.program.methods
    .deposit()
    .accountsPartial({
      buyer: buyer.publicKey,
      escrow,
      vault,
      buyerAta,
      mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  // ── Act 1 — stream releases for the first 4 checkpoints ─────────────
  console.log('[demo] act 1 · streaming first 4 checkpoints to 100%');
  for (let i = 0; i < 4; i++) {
    await arbiterCtx.program.methods
      .releaseStreamed(i, weights[i])
      .accountsPartial({
        arbiter: arbiter.publicKey,
        escrow,
        vault,
        worker: worker.publicKey,
        workerAta,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    await sleep(1_500);
  }

  // ── Act 2 — failure: pause the stream ──────────────────────────────
  console.log('[demo] act 2 · arbiter pauses stream (verifier rejected artifact)');
  await arbiterCtx.program.methods
    .setPause(true)
    .accountsPartial({ arbiter: arbiter.publicKey, escrow })
    .rpc();
  await sleep(3_000);

  // ── Act 3 — resume + score remaining checkpoints partially then fully
  console.log('[demo] act 3 · arbiter unpauses, releases remaining at 80% then 100%');
  await arbiterCtx.program.methods
    .setPause(false)
    .accountsPartial({ arbiter: arbiter.publicKey, escrow })
    .rpc();

  for (let i = 4; i < spec.checkpoints.length; i++) {
    const w = weights[i];
    const partial = Math.round(w * 0.8);
    await arbiterCtx.program.methods
      .releaseStreamed(i, partial)
      .accountsPartial({
        arbiter: arbiter.publicKey,
        escrow,
        vault,
        worker: worker.publicKey,
        workerAta,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    await sleep(1_000);
    await arbiterCtx.program.methods
      .releaseStreamed(i, w)
      .accountsPartial({
        arbiter: arbiter.publicKey,
        escrow,
        vault,
        worker: worker.publicKey,
        workerAta,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    await sleep(800);
  }

  // ── Finalize — surplus routes by quality threshold ──────────────────
  console.log('[demo] finalize · routing surplus by quality threshold');
  await arbiterCtx.program.methods
    .finalizeJob()
    .accountsPartial({
      cranker: arbiter.publicKey,
      escrow,
      vault,
      worker: worker.publicKey,
      workerAta,
      buyerAta,
      mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  const final = await buyerCtx.program.account.escrow.fetch(escrow);
  console.log(
    `[demo] done · released=${final.released.toNumber() / 1_000_000} USDC, finalized=${final.finalized}`,
  );
}

main().catch((e) => {
  console.error('[demo] fatal:', e);
  process.exit(1);
});
