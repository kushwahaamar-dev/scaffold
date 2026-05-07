import { useEffect, useState } from 'react';
import { useChainId, usePublicClient } from 'wagmi';
import { formatUnits, type Address } from 'viem';

import { SCAFFOLD_ESCROW_ABI } from '../chain/abi';
import { escrowAddress, explorerAddressUrl } from '../chain/config';

type Row = { worker: Address; totalReleasedUsdc: number; jobs: number };

const USDC_DECIMALS = 6;

export function Leaderboard() {
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!publicClient) return;
    let escrowAddr: Address;
    try { escrowAddr = escrowAddress(chainId); } catch { return; }

    let cancelled = false;
    const refresh = async () => {
      setBusy(true); setErr(null);
      try {
        // Pull recent release events. Public Base Sepolia RPC caps log
        // queries to a small block range; 5_000 blocks ≈ 2.5 hours on Base.
        const head = await publicClient.getBlockNumber();
        const fromBlock = head > 5_000n ? head - 5_000n : 0n;
        const events = await publicClient.getContractEvents({
          address: escrowAddr,
          abi: SCAFFOLD_ESCROW_ABI,
          eventName: 'ReleaseStreamed',
          fromBlock,
          toBlock: head,
        });
        // Map jobId → released sum
        const perJob = new Map<string, bigint>();
        for (const ev of events) {
          const jobId = ev.args.jobId as string;
          const amount = ev.args.amount as bigint;
          perJob.set(jobId, (perJob.get(jobId) ?? 0n) + amount);
        }
        // Pull JobInitialized events to map jobId → worker
        const inits = await publicClient.getContractEvents({
          address: escrowAddr,
          abi: SCAFFOLD_ESCROW_ABI,
          eventName: 'JobInitialized',
          fromBlock,
          toBlock: head,
        });
        const jobToWorker = new Map<string, Address>();
        for (const ev of inits) {
          jobToWorker.set(ev.args.jobId as string, ev.args.worker as Address);
        }
        // Aggregate by worker
        const byWorker = new Map<Address, Row>();
        for (const [jobId, total] of perJob) {
          const worker = jobToWorker.get(jobId);
          if (!worker) continue;
          const usdc = Number(formatUnits(total, USDC_DECIMALS));
          const row = byWorker.get(worker) ?? { worker, totalReleasedUsdc: 0, jobs: 0 };
          row.totalReleasedUsdc += usdc;
          row.jobs += 1;
          byWorker.set(worker, row);
        }
        if (!cancelled) {
          setRows([...byWorker.values()].sort((a, b) => b.totalReleasedUsdc - a.totalReleasedUsdc));
        }
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void refresh();
    const id = setInterval(refresh, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [chainId, publicClient]);

  return (
    <section className="chain-section" aria-label="Worker leaderboard">
      <div className="chain-head">
        <div>
          <p className="section-label">Worker leaderboard</p>
          <h2 className="section-title chain-title">Earned USDC = on-chain reputation</h2>
          <p className="section-text chain-lede">
            Lifetime USDC released across every Scaffold job on Base, indexed from
            <code> ReleaseStreamed</code> events. Reputation is just money the verifier signed off on.
          </p>
        </div>
      </div>
      {busy && rows.length === 0 ? <p className="chain-busy">Indexing events…</p> : null}
      {err ? <pre className="chain-error" role="alert">{err}</pre> : null}
      <div className="release-grid">
        {rows.length === 0 && !busy ? (
          <p className="chain-muted">No releases on this chain yet — initialize a job above.</p>
        ) : null}
        {rows.map((row, idx) => (
          <div key={row.worker} className="release-row">
            <div>
              <span className="release-idx">{idx + 1}</span>
              <a
                className="release-title mono"
                href={explorerAddressUrl(chainId, row.worker)}
                target="_blank"
                rel="noreferrer"
              >
                {row.worker.slice(0, 8)}…{row.worker.slice(-4)}
              </a>
              <span className="released-tag">{row.jobs} job{row.jobs === 1 ? '' : 's'}</span>
            </div>
            <strong>${row.totalReleasedUsdc.toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
