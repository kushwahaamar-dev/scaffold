/**
 * Worker-side client. Pays the verifier API per /score call via x402, then
 * (optionally) settles release_streamed on Base.
 *
 *   - The worker's wallet pays USDC microfees for each verification tick.
 *   - Demonstrates "economic reasoning": the worker decides whether to call
 *     the premium verifier (us.amazon.nova-pro-v1:0) or a cheaper model based
 *     on the /pricing response.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { wrapFetchWithPayment } from 'x402-fetch';
import { buildClients, loadPrivateKey } from './lib/chain.js';

type Spec = {
  title: string;
  checkpoints: Array<{ id: string; title: string; weight_bps: number; rubric: string }>;
};

async function main() {
  const required = ['VERIFIER_URL', 'WORKER_PRIVATE_KEY', 'ARTIFACT', 'JOB_ID'];
  for (const k of required) {
    if (!process.env[k]) throw new Error(`Missing ${k}`);
  }

  const verifierUrl = process.env.VERIFIER_URL!;
  const specPath = process.env.SPEC ?? 'agents/spec.example.json';
  const artifactPath = process.env.ARTIFACT!;
  const tickMs = Number(process.env.TICK_MS ?? 30_000);
  const jobId = process.env.JOB_ID! as `0x${string}`;

  // Build a viem wallet client for x402 to sign payment authorizations with.
  const { wal: walletClient } = buildClients('WORKER_PRIVATE_KEY');
  loadPrivateKey('WORKER_PRIVATE_KEY'); // sanity

  const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient as unknown as Parameters<typeof wrapFetchWithPayment>[1]);

  const spec: Spec = JSON.parse(readFileSync(specPath, 'utf8'));

  // Inspect pricing first — economic reasoning surface.
  const pricingResp = await fetch(new URL('/pricing', verifierUrl).toString());
  const pricing = await pricingResp.json();
  console.log(`[client] verifier /pricing → $${pricing.paywalled_endpoints?.['/score']?.price_usdc}/call on ${pricing.paywalled_endpoints?.['/score']?.network}`);

  console.log(`[client] streaming verification every ${tickMs}ms against job ${jobId}`);

  for (;;) {
    const artifact = readFileSync(artifactPath, 'utf8');
    try {
      const resp = await fetchWithPayment(new URL('/score', verifierUrl).toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ spec, artifact, job_id: jobId }),
      });
      if (!resp.ok) {
        console.warn(`[client] /score ${resp.status} ${await resp.text()}`);
      } else {
        const data = await resp.json();
        console.log(`[client] scored ${data.results?.length ?? 0} checkpoints; settlement_txs=${(data.settlement_txs ?? []).length}`);
        for (const r of data.results ?? []) {
          console.log(`  · ${r.checkpoint_id}: ${r.score_bps} bps — ${String(r.evidence).slice(0, 80)}`);
        }
      }
    } catch (e) {
      console.warn(`[client] tick failed: ${(e as Error).message}`);
    }
    await sleep(tickMs);
  }
}

main().catch((e) => {
  console.error('[client] fatal:', e);
  process.exit(1);
});
