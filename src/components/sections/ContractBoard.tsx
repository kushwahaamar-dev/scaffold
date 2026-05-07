import type { CheckpointState, ScaffoldContract, ScaffoldSettlement } from '../../domain/scaffold';
import { Metric } from '../ui/Metric';
import { ProgressBar } from '../ui/ProgressBar';

type ContractBoardProps = {
  contract: ScaffoldContract;
  settlement: ScaffoldSettlement;
  live: boolean;
};

export function ContractBoard({ contract, settlement, live }: ContractBoardProps) {
  return (
    <>
      <section aria-label="Settlement state" className="ledger-card">
        <div className="ledger-header">
          <span>{contract.client}</span>
          <span>{contract.currency} escrow</span>
        </div>
        <div className="amount-row">
          <span className="amount">{formatCurrency(settlement.releasedAmount)} released</span>
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
      </section>

      <section className="board">
        <div className="board-intro">
          <p className="section-label">Live work contract</p>
          <h2 className="section-title">{contract.title}</h2>
          <p className="section-text">
            Worker: <strong className="section-strong">{contract.worker}</strong>.{' '}
            {settlement.failedCheckpoints[0]
              ? 'A failed checkpoint pauses new release while completed work stays paid until repaired and re-verified.'
              : 'Released checkpoints are honored on-chain. Remaining checkpoints continue to stream on verification.'}
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
    </>
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
