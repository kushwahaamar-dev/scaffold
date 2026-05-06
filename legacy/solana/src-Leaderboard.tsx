import { useEffect, useState } from 'react';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';

import { explorerAddressUrl } from '../chain/config';
import { fetchAllEscrows, rankWorkers, type LeaderboardRow } from '../chain/leaderboard';
import { getProgram } from '../chain/program';

export function Leaderboard() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    const refresh = async () => {
      setBusy(true);
      setErr(null);
      try {
        const program = getProgram(connection, wallet);
        const escrows = await fetchAllEscrows(program);
        if (!cancelled) setRows(rankWorkers(escrows));
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void refresh();
    const id = setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [connection, wallet]);

  if (!wallet) {
    return (
      <section className="chain-section" aria-label="Worker leaderboard">
        <p className="section-label">Worker leaderboard</p>
        <h2 className="section-title chain-title">Connect a wallet to load worker reputation</h2>
      </section>
    );
  }

  return (
    <section className="chain-section" aria-label="Worker leaderboard">
      <div className="chain-head">
        <div>
          <p className="section-label">Worker leaderboard</p>
          <h2 className="section-title chain-title">Earned USDC = on-chain reputation</h2>
          <p className="section-text chain-lede">
            Lifetime USDC released across every Scaffold escrow, indexed by worker pubkey. No reviews, no stars —
            reputation is just money the verifier signed off on, sitting in a wallet.
          </p>
        </div>
      </div>
      {busy && rows.length === 0 ? (
        <p className="chain-busy">Indexing program accounts…</p>
      ) : null}
      {err ? <pre className="chain-error" role="alert">{err}</pre> : null}
      <div className="release-grid">
        {rows.length === 0 && !busy ? (
          <p className="chain-muted">No escrows on this cluster yet — initialize one above.</p>
        ) : null}
        {rows.map((row, idx) => (
          <div key={row.worker.toBase58()} className="release-row">
            <div>
              <span className="release-idx">{idx + 1}</span>
              <a
                className="release-title mono"
                href={explorerAddressUrl(row.worker.toBase58())}
                target="_blank"
                rel="noreferrer"
              >
                {row.worker.toBase58().slice(0, 8)}…{row.worker.toBase58().slice(-4)}
              </a>
              <span className="released-tag">{row.jobs} job{row.jobs === 1 ? '' : 's'}</span>
              {row.finalizedJobs > 0 ? (
                <span className="released-tag">{row.finalizedJobs} finalized</span>
              ) : null}
            </div>
            <strong>${row.totalReleasedUsdc.toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
