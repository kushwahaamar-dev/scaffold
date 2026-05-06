import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import App from './App';

function TestHarness({ children }: { children: ReactNode }) {
  return (
    <ConnectionProvider endpoint="https://api.devnet.solana.com">
      <WalletProvider wallets={[new PhantomWalletAdapter()]} autoConnect={false}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}

describe('Scaffold demo app', () => {
  it('renders the core hackathon story', () => {
    render(<App />, { wrapper: TestHarness });

    expect(screen.getByRole('heading', { name: /Stripe for verified work/i })).toBeInTheDocument();
    expect(screen.getByText(/Payment paused/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /Performance budget/i })).toBeInTheDocument();
    expect(screen.getByText(/\$575 released/i)).toBeInTheDocument();
  });
});
