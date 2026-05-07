import { ConnectButton } from '@rainbow-me/rainbowkit';
import type { UseAccountReturnType } from 'wagmi';

type HeroSectionProps = {
  account: UseAccountReturnType;
  statusLabel: string;
  budgetLabel: string;
  onScrollToEscrow: () => void;
};

export function HeroSection({ account, statusLabel, budgetLabel, onScrollToEscrow }: HeroSectionProps) {
  return (
    <section className="hero">
      <p className="eyebrow">Scaffold operations console</p>
      <h1 className="title">
        Stripe for <span className="title-accent">verified work</span>
      </h1>
      <p className="subtitle">
        Manage contract initialization, checkpoint-based releases, and payout finalization from one
        workflow. Verifier decisions are enforced on-chain so payment state stays deterministic.
      </p>

      <div className="hero-actions">
        <ConnectButton chainStatus="icon" accountStatus={{ smallScreen: 'avatar', largeScreen: 'address' }} />
        <button type="button" className="primary-hero-btn" onClick={onScrollToEscrow}>
          {account.isConnected ? 'Open escrow controls' : 'Get started'}
        </button>
      </div>

      <div className="hero-meta">
        <span className="status-pill">{statusLabel}</span>
        <span className="quiet-pill">{budgetLabel}</span>
      </div>
      <div className="hero-steps" aria-label="Quick workflow">
        <span className="hero-step">1. Initialize</span>
        <span className="hero-step">2. Deposit</span>
        <span className="hero-step">3. Stream by checkpoints</span>
        <span className="hero-step">4. Finalize</span>
      </div>
    </section>
  );
}
