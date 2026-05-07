type TopHeaderProps = {
  chainLabel: string;
  live: boolean;
};

export function TopHeader({ chainLabel, live }: TopHeaderProps) {
  return (
    <header className="top-bar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          S
        </span>
        <div>
          <div className="brand-name">Scaffold Suite</div>
          <div className="brand-subtitle">Agent escrow control plane</div>
        </div>
      </div>
      <div className="top-meta-wrap">
        <div className="top-meta">
          <span className="network-chip">{chainLabel} · x402</span>
          <span className="network-chip network-chip--muted">
            {live ? 'On-chain escrow connected' : 'AWS Bedrock verifier'}
          </span>
        </div>
      </div>
    </header>
  );
}
