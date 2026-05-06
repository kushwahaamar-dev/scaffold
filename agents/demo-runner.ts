/**
 * 3-act on-chain demo on Base. No LLM calls — deterministic for the pitch.
 *
 *   Act 0 — initialize + approve + deposit
 *   Act 1 — release first 4 checkpoints to 100%
 *   Act 2 — pause stream
 *   Act 3 — unpause, release remaining at 80% then 100%
 *   Final — anyone cranks finalizeJob; surplus routes by quality threshold
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { keccak256, parseUnits, toBytes, type Address, type Hex } from 'viem';

import { ERC20_ABI } from '../src/chain/abi.js';
import {
  SCAFFOLD_ESCROW_ABI,
  buildClients,
  getEscrowAddress,
  getUsdcAddress,
  jobIdFor,
} from './lib/chain.js';

type Spec = {
  title: string;
  checkpoints: Array<{ id: string; weight_bps: number }>;
};

async function main() {
  const required = ['BUYER_PRIVATE_KEY', 'WORKER_ADDRESS', 'ARBITER_PRIVATE_KEY', 'SCAFFOLD_ESCROW_ADDRESS'];
  for (const k of required) {
    if (!process.env[k]) throw new Error(`Missing ${k}`);
  }
  const specPath = process.env.SPEC ?? 'agents/spec.example.json';
  const budgetUsdc = process.env.BUDGET_USDC ?? '25';
  const nonce = BigInt(process.env.NONCE ?? Math.floor(Date.now() / 1000).toString());

  const buyerCtx = buildClients('BUYER_PRIVATE_KEY');
  const arbiterCtx = buildClients('ARBITER_PRIVATE_KEY');
  const worker = process.env.WORKER_ADDRESS as Address;

  const escrow = getEscrowAddress();
  const usdc = getUsdcAddress();
  const spec: Spec = JSON.parse(readFileSync(specPath, 'utf8'));

  const weights = new Array<number>(16).fill(0);
  for (let i = 0; i < spec.checkpoints.length; i++) {
    weights[i] = spec.checkpoints[i].weight_bps;
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum !== 10_000) throw new Error(`Spec weights sum to ${sum}, expected 10000`);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 6 * 3600);
  const specHash = keccak256(toBytes(JSON.stringify(spec))) as Hex;
  const budget = parseUnits(budgetUsdc, 6);
  const jobId = jobIdFor(buyerCtx.account.address, nonce);

  console.log(`[demo] jobId=${jobId} nonce=${nonce}`);
  console.log(`[demo] buyer=${buyerCtx.account.address} worker=${worker} arbiter=${arbiterCtx.account.address}`);

  console.log('[demo] act 0 · initialize + approve + deposit');
  await buyerCtx.wal.writeContract({
    address: escrow,
    abi: SCAFFOLD_ESCROW_ABI,
    functionName: 'initialize',
    args: [
      nonce,
      worker,
      arbiterCtx.account.address,
      usdc,
      budget,
      deadline,
      8000,
      spec.checkpoints.length,
      weights as unknown as readonly [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number],
      specHash,
    ],
    chain: buyerCtx.pub.chain, account: buyerCtx.account,
  });

  await buyerCtx.wal.writeContract({
    address: usdc,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [escrow, budget],
    chain: buyerCtx.pub.chain, account: buyerCtx.account,
  });

  await buyerCtx.wal.writeContract({
    address: escrow,
    abi: SCAFFOLD_ESCROW_ABI,
    functionName: 'deposit',
    args: [jobId],
    chain: buyerCtx.pub.chain, account: buyerCtx.account,
  });

  console.log('[demo] act 1 · streaming first 4 checkpoints to 100%');
  for (let i = 0; i < 4; i++) {
    await arbiterCtx.wal.writeContract({
      address: escrow, abi: SCAFFOLD_ESCROW_ABI,
      functionName: 'releaseStreamed', args: [jobId, i, weights[i]],
      chain: arbiterCtx.pub.chain, account: arbiterCtx.account,
    });
    await sleep(1500);
  }

  console.log('[demo] act 2 · arbiter pauses stream');
  await arbiterCtx.wal.writeContract({
    address: escrow, abi: SCAFFOLD_ESCROW_ABI,
    functionName: 'setPause', args: [jobId, true],
    chain: arbiterCtx.pub.chain, account: arbiterCtx.account,
  });
  await sleep(2500);

  console.log('[demo] act 3 · unpause + release remaining at 80% then 100%');
  await arbiterCtx.wal.writeContract({
    address: escrow, abi: SCAFFOLD_ESCROW_ABI,
    functionName: 'setPause', args: [jobId, false],
    chain: arbiterCtx.pub.chain, account: arbiterCtx.account,
  });

  for (let i = 4; i < spec.checkpoints.length; i++) {
    const w = weights[i];
    const partial = Math.round(w * 0.8);
    await arbiterCtx.wal.writeContract({
      address: escrow, abi: SCAFFOLD_ESCROW_ABI,
      functionName: 'releaseStreamed', args: [jobId, i, partial],
      chain: arbiterCtx.pub.chain, account: arbiterCtx.account,
    });
    await sleep(900);
    await arbiterCtx.wal.writeContract({
      address: escrow, abi: SCAFFOLD_ESCROW_ABI,
      functionName: 'releaseStreamed', args: [jobId, i, w],
      chain: arbiterCtx.pub.chain, account: arbiterCtx.account,
    });
    await sleep(700);
  }

  console.log('[demo] finalize · routing surplus by quality threshold');
  await arbiterCtx.wal.writeContract({
    address: escrow, abi: SCAFFOLD_ESCROW_ABI,
    functionName: 'finalizeJob', args: [jobId],
    chain: arbiterCtx.pub.chain, account: arbiterCtx.account,
  });

  const job = await buyerCtx.pub.readContract({
    address: escrow, abi: SCAFFOLD_ESCROW_ABI,
    functionName: 'getJob', args: [jobId],
  });
  console.log(`[demo] done · released=${Number(job[5]) / 1_000_000} USDC, finalized=${job[11]}`);
}

main().catch((e) => {
  console.error('[demo] fatal:', e);
  process.exit(1);
});
