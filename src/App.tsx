import { useCallback, useMemo, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { formatUnits } from 'viem';

import { OnChainEscrow, type EscrowSession } from './components/OnChainEscrow';
import { Leaderboard } from './components/Leaderboard';
import { TopHeader } from './components/layout/TopHeader';
import { ContractBoard } from './components/sections/ContractBoard';
import { HeroSection } from './components/sections/HeroSection';
import './App.css';
import {
  createDemoContract,
  evaluateContract,
  type CheckpointState,
  type ScaffoldContract,
} from './domain/scaffold';

export default function App() {
  const chainId = useChainId();
  const account = useAccount();
  const [session, setSession] = useState<EscrowSession>(null);
  const onSession = useCallback((next: EscrowSession) => setSession(next), []);

  const contract = useMemo<ScaffoldContract>(() => deriveContract(session), [session]);
  const settlement = evaluateContract(contract);
  const live = session !== null;
  const statusLabel = settlement.status === 'paused' ? 'Payment paused' : 'Streaming';
  const chainLabel = chainId === 8453 ? 'Base' : 'Base Sepolia';

  const scrollToEscrow = () => {
    document.querySelector('.chain-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div id="top" className="shell">
      <TopHeader chainLabel={chainLabel} live={live} />

      <main className="app-layout">
        <aside className="app-rail" aria-label="Workspace navigation">
          <p className="rail-label">Workspace</p>
          <a className="rail-link" href="#overview">Overview</a>
          <a className="rail-link" href="#escrow">Escrow controls</a>
          <a className="rail-link" href="#leaderboard">Leaderboard</a>
          <div className="rail-divider" />
          <p className="rail-label">Status</p>
          <div className="rail-stat">
            <span>Mode</span>
            <strong>{statusLabel}</strong>
          </div>
          <div className="rail-stat">
            <span>Chain</span>
            <strong>{chainLabel}</strong>
          </div>
          <div className="rail-stat">
            <span>Budget</span>
            <strong>{live ? `${contract.currency} ${contract.budget}` : 'Demo'}</strong>
          </div>
        </aside>

        <section className="app-canvas">
          <div id="overview" className="main-flow">
            <HeroSection
              account={account}
              statusLabel={statusLabel}
              budgetLabel={live ? `${contract.currency} ${contract.budget} budget` : 'Consensus 72-hour MVP'}
              onScrollToEscrow={scrollToEscrow}
            />
            <ContractBoard contract={contract} settlement={settlement} live={live} />
            <OnChainEscrow onSession={onSession} />
            <Leaderboard />
          </div>
        </section>
      </main>
      <a className="back-to-top" href="#top" aria-label="Back to top">
        Top
      </a>
    </div>
  );
}

function deriveContract(session: EscrowSession): ScaffoldContract {
  const base = createDemoContract();
  if (!session) return base;

  const usdcDec = 6;
  const budgetUi = Number(formatUnits(session.budget, usdcDec));
  const releasedUi = Number(formatUnits(session.released, usdcDec));
  const count = session.checkpointCount;
  const bps = session.bpsReleasedPerCp;
  const weights = session.weights;

  const chainCheckpoints = base.checkpoints.slice(0, count).map((cp, idx) => {
    const weight = weights[idx] ?? 0;
    const releasedBps = bps[idx] ?? 0;
    const fraction = weight === 0 ? 0 : releasedBps / weight;
    const tail = `${(releasedBps / 100).toFixed(2)}% released by arbiter ${session.arbiter.slice(0, 8)}…`;
    if (fraction >= 1) return { ...cp, state: 'passed' as CheckpointState, evidence: tail };
    if (fraction > 0) return { ...cp, state: 'running' as CheckpointState, evidence: `Streaming · ${tail}` };
    if (session.paused) {
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
        summary: `Chain state: released ${releasedUi} USDC, ${
          session.paused ? 'paused' : session.finalized ? 'finalized' : 'active'
        }.`,
      },
    ],
  };
}

