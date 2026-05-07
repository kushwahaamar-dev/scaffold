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
import { encodeFunctionData, keccak256, parseUnits, toBytes, type Abi, type Address, type Hex } from 'viem';

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

  // Helper: encode calldata manually + sendTransaction, bypassing viem's
  // eth_call simulation. Public Base Sepolia RPC's view sometimes lags one
  // block behind a just-confirmed tx, causing the simulation to revert even
  // though the actual on-chain state is correct.
  type Ctx = typeof buyerCtx;
  type WriteParams = {
    address: Address;
    abi: Abi;
    functionName: string;
    args: readonly unknown[];
    [k: string]: unknown;
  };
  // Hard-coded generous gas limit lets viem skip eth_estimateGas, which
  // would simulate against a possibly-stale RPC view and revert. 1M gas is
  // more than enough for any single ScaffoldEscrow call (deploy is ~1.1M).
  const FIXED_GAS = 1_000_000n;
  const sendAndConfirm = async (ctx: Ctx, label: string, p: WriteParams): Promise<Hex> => {
    const data = encodeFunctionData({ abi: p.abi, functionName: p.functionName, args: p.args });
    const hash = await ctx.wal.sendTransaction({
      account: ctx.account,
      chain: ctx.pub.chain,
      to: p.address,
      data,
      gas: FIXED_GAS,
    });
    console.log(`  · ${label}: ${hash}`);
    await ctx.pub.waitForTransactionReceipt({ hash });
    return hash;
  };

  // Allow resuming a pre-deposited job (skips Act 0). Useful when a previous
  // run partially completed.
  let activeJobId: Hex = jobId;
  let activeWeights = weights;
  if (process.env.RESUME_JOB_ID) {
    activeJobId = process.env.RESUME_JOB_ID as Hex;
    console.log(`[demo] RESUME_JOB_ID set → skipping act 0; using existing job ${activeJobId}`);
    const job = await buyerCtx.pub.readContract({
      address: escrow, abi: SCAFFOLD_ESCROW_ABI,
      functionName: 'getJob', args: [activeJobId],
    }) as readonly [Address, Address, Address, Address, bigint, bigint, bigint, number, number, boolean, boolean, boolean, Hex];
    if (!job[9]) throw new Error('Resumed job is not deposited');
    if (job[11]) throw new Error('Resumed job is already finalized');
    activeWeights = new Array<number>(16).fill(0);
    for (let i = 0; i < job[8]; i++) {
      const [w] = await buyerCtx.pub.readContract({
        address: escrow, abi: SCAFFOLD_ESCROW_ABI,
        functionName: 'getCheckpointProgress', args: [activeJobId, i],
      }) as readonly [number, number];
      activeWeights[i] = w;
    }
  } else {
    console.log('[demo] act 0 · initialize + approve + deposit');
    await sendAndConfirm(buyerCtx, 'initialize', {
      address: escrow,
      abi: SCAFFOLD_ESCROW_ABI,
      functionName: 'initialize',
      args: [
        nonce, worker, arbiterCtx.account.address, usdc, budget, deadline, 8000,
        spec.checkpoints.length,
        weights as unknown as readonly [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number],
        specHash,
      ],
      chain: buyerCtx.pub.chain, account: buyerCtx.account,
    });
    await sendAndConfirm(buyerCtx, 'approve', {
      address: usdc, abi: ERC20_ABI, functionName: 'approve', args: [escrow, budget],
      chain: buyerCtx.pub.chain, account: buyerCtx.account,
    });
    await sendAndConfirm(buyerCtx, 'deposit', {
      address: escrow, abi: SCAFFOLD_ESCROW_ABI, functionName: 'deposit', args: [activeJobId],
      chain: buyerCtx.pub.chain, account: buyerCtx.account,
    });
  }

  console.log('[demo] act 1 · streaming first 4 checkpoints to 100%');
  for (let i = 0; i < 4; i++) {
    await sendAndConfirm(arbiterCtx, `release cp[${i}] @ ${activeWeights[i]}bps`, {
      address: escrow, abi: SCAFFOLD_ESCROW_ABI,
      functionName: 'releaseStreamed', args: [activeJobId, i, activeWeights[i]],
      chain: arbiterCtx.pub.chain, account: arbiterCtx.account,
    });
  }

  console.log('[demo] act 2 · arbiter pauses stream');
  await sendAndConfirm(arbiterCtx, 'pause', {
    address: escrow, abi: SCAFFOLD_ESCROW_ABI,
    functionName: 'setPause', args: [activeJobId, true],
    chain: arbiterCtx.pub.chain, account: arbiterCtx.account,
  });
  await sleep(2500);

  console.log('[demo] act 3 · unpause + release remaining at 80% then 100%');
  await sendAndConfirm(arbiterCtx, 'unpause', {
    address: escrow, abi: SCAFFOLD_ESCROW_ABI,
    functionName: 'setPause', args: [activeJobId, false],
    chain: arbiterCtx.pub.chain, account: arbiterCtx.account,
  });

  for (let i = 4; i < spec.checkpoints.length; i++) {
    const w = activeWeights[i];
    const partial = Math.round(w * 0.8);
    await sendAndConfirm(arbiterCtx, `release cp[${i}] @ ${partial}bps (80%)`, {
      address: escrow, abi: SCAFFOLD_ESCROW_ABI,
      functionName: 'releaseStreamed', args: [activeJobId, i, partial],
      chain: arbiterCtx.pub.chain, account: arbiterCtx.account,
    });
    await sendAndConfirm(arbiterCtx, `release cp[${i}] @ ${w}bps (100%)`, {
      address: escrow, abi: SCAFFOLD_ESCROW_ABI,
      functionName: 'releaseStreamed', args: [activeJobId, i, w],
      chain: arbiterCtx.pub.chain, account: arbiterCtx.account,
    });
  }

  console.log('[demo] finalize · routing surplus by quality threshold');
  await sendAndConfirm(arbiterCtx, 'finalize', {
    address: escrow, abi: SCAFFOLD_ESCROW_ABI,
    functionName: 'finalizeJob', args: [activeJobId],
    chain: arbiterCtx.pub.chain, account: arbiterCtx.account,
  });

  const job = await buyerCtx.pub.readContract({
    address: escrow, abi: SCAFFOLD_ESCROW_ABI,
    functionName: 'getJob', args: [activeJobId],
  });
  console.log(`[demo] done · released=${Number(job[5]) / 1_000_000} USDC, finalized=${job[11]}`);
}

main().catch((e) => {
  console.error('[demo] fatal:', e);
  process.exit(1);
});
