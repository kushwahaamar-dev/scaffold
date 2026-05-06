import { useCallback, useId, useMemo, useState } from 'react';

import { OnChainEscrow, type EscrowSession } from './components/OnChainEscrow';
import { Leaderboard } from './components/Leaderboard';
import './App.css';
import { getCluster } from './chain/config';
import {
  createDemoContract,
  evaluateContract,
  type CheckpointState,
  type ScaffoldContract,
} from './domain/scaffold';

export default function App() {
  const cluster = getCluster();
  const [session, setSession] = useState<EscrowSession>(null);
  const onSession = useCallback((next: EscrowSession) => setSession(next), []);

  const contract = useMemo<ScaffoldContract>(() => deriveContract(session), [session]);
  const settlement = evaluateContract(contract);
  const live = session !== null;
  const statusLabel = settlement.status === 'paused' ? 'Payment paused' : 'Streaming';

  return (
    <div className="shell">
      <header className="top-bar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Scaffold</span>
        </div>
        <div className="top-meta">
          <span className="network-chip">Solana · {cluster}</span>
          <span className="network-chip network-chip--muted">
            {live ? 'On-chain escrow connected' : 'Structured verifier'}
          </span>
        </div>
      </header>

      <main className="main-flow">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Protocol demo</p>
            <h1 className="title">
              Stripe for <em className="title-accent">verified work</em>
            </h1>
            <p className="subtitle">
              Specs become contracts. Checkpoints become release conditions. A lightweight judge decides whether
              USDC keeps streaming, pauses, or returns to the buyer — no ticket queue, no subjective mediation.
            </p>
            <div className="hero-actions">
              <span className="primary-pill">
                <span className="pulse-dot" aria-hidden="true" />
                {statusLabel}
              </span>
              <span className="secondary-pill">
                {live ? `${contract.currency} ${contract.budget} budget` : 'Consensus 72-hour MVP'}
              </span>
            </div>
          </div>

          <div aria-label="Settlement state" className="ledger-card">
            <div className="ledger-header">
              <span>{contract.client}</span>
              <span>{contract.currency} escrow</span>
            </div>
            <div className="amount-row">
              <span className="amount">
                {formatCurrency(settlement.releasedAmount)} released
              </span>
              <span className="amount-caption">
                {live ? 'on-chain · per-checkpoint' : 'to worker · checkpoint-weighted'}
              </span>
            </div>
            <div className="ledger-grid">
              <Metric label="Locked" value={formatCurrency(settlement.lockedAmount)} />
              <Metric label="Refundable" value={formatCurrency(settlement.refundableAmount)} />
              <Metric label="Verified weight" value={`${settlement.verifiedWeight}%`} />
            </div>
            <div className="progress-block">
              <div className="progress-labels">
                <span>Checkpoint coverage</span>
                <span>{settlement.verifiedWeight}%</span>
              </div>
              <ProgressBar pct={settlement.verifiedWeight} />
            </div>
          </div>
        </section>

        <section className="board">
          <div className="board-intro">
            <p className="section-label">Live work contract</p>
            <h2 className="section-title">{contract.title}</h2>
            <p className="section-text">
              Worker: <strong className="section-strong">{contract.worker}</strong>.{' '}
              {settlement.failedCheckpoints[0]
                ? 'The failed performance checkpoint stops new release while completed work remains paid. Once the agent fixes the regression, the same judge resumes the stream.'
                : 'All released checkpoints have been honored on-chain by the arbiter wallet. Future checkpoints stream as the verifier signs them.'}
            </p>
          </div>

          <div className="checkpoint-grid">
            {contract.checkpoints.map((checkpoint) => (
              <article key={checkpoint.id} className={checkpointCardClassName(checkpoint.state)}>
                <div className="checkpoint-topline">
                  <span className={statePillClassName(checkpoint.state)}>{checkpoint.state}</span>
                  <span className="weight">{checkpoint.weight}%</span>
                </div>
                <h3 className="checkpoint-title">{checkpoint.title}</h3>
                <p className="evidence">{checkpoint.evidence}</p>
              </article>
            ))}
          </div>
        </section>

        <OnChainEscrow onSession={onSession} />
        <Leaderboard />
      </main>
    </div>
  );
}

function deriveContract(session: EscrowSession): ScaffoldContract {
  const base = createDemoContract();
  if (!session) {
    return base;
  }

  const { escrow, releasedUiAmount } = session;
  const budgetUi = escrow.budget.toNumber() / 1_000_000;
  const count = escrow.checkpointCount;
  const bpsReleased = escrow.bpsReleasedPerCp;
  const weights = escrow.weights;

  const chainCheckpoints = base.checkpoints.slice(0, count).map((cp, idx) => {
    const weightBps = weights[idx];
    const releasedBps = bpsReleased[idx];
    const fraction = weightBps === 0 ? 0 : releasedBps / weightBps;
    const evidenceTail = `${(releasedBps / 100).toFixed(2)}% of 100% released by arbiter ${escrow.arbiter
      .toBase58()
      .slice(0, 6)}…`;

    if (fraction >= 1) {
      return { ...cp, state: 'passed' as CheckpointState, evidence: evidenceTail };
    }
    if (fraction > 0) {
      return {
        ...cp,
        state: 'running' as CheckpointState,
        evidence: `Streaming · ${evidenceTail}`,
      };
    }
    if (escrow.paused) {
      return {
        ...cp,
        state: 'failed' as CheckpointState,
        evidence: 'Stream paused by arbiter — verifier rejected latest artifact.',
      };
    }
    return { ...cp, state: 'pending' as CheckpointState };
  });

  return {
    ...base,
    budget: budgetUi,
    streamCap: budgetUi,
    checkpoints: chainCheckpoints,
    auditTrail: [
      {
        at: new Date().toISOString(),
        summary: `Chain state: released ${releasedUiAmount} USDC, ${
          escrow.paused ? 'paused' : escrow.finalized ? 'finalized' : 'active'
        }.`,
      },
    ],
  };
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const gid = useId().replace(/:/g, '');
  const w = Math.min(100, Math.max(0, pct));
  const gradId = `pg-${gid}`;
  return (
    <svg
      className="progress-svg"
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
      role="presentation"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#b8872e" />
          <stop offset="45%" stopColor="#d4a853" />
          <stop offset="100%" stopColor="#ffe7b3" />
        </linearGradient>
      </defs>
      <rect className="progress-svg-bg" x="0" y="0" width="100" height="10" rx="5" />
      <rect className="progress-svg-fill" x="0" y="0" width={w} height="10" rx="5" fill={`url(#${gradId})`} />
    </svg>
  );
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString('en-US')}`;
}

function checkpointCardClassName(state: CheckpointState) {
  return `checkpoint-card checkpoint-card--${state}`;
}

function statePillClassName(state: CheckpointState) {
  return `state-pill state-pill--${state}`;
}
