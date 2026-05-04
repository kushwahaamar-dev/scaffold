import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';

import App, { deriveContract } from './App';
import { evaluateContract } from './domain/scaffold';

function TestHarness({ children }: { children: ReactNode }) {
  const config = createConfig({
    chains: [baseSepolia],
    transports: { [baseSepolia.id]: http() },
  });
  const queryClient = new QueryClient();
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

describe('Scaffold demo app', () => {
  it('renders the core hackathon story', () => {
    render(<App />, { wrapper: TestHarness });

    expect(screen.getByRole('heading', { name: /Stripe for verified work/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /Performance budget/i })).toBeInTheDocument();
    expect(screen.getByText(/\$575 released/i)).toBeInTheDocument();
  });

  it('uses contract balances and weights for partial terminal jobs', () => {
    const contract = deriveContract({
      jobId: `0x${'11'.repeat(32)}`, buyer: '0x0000000000000000000000000000000000000001',
      worker: '0x0000000000000000000000000000000000000002', arbiter: '0x0000000000000000000000000000000000000003',
      budget: 100_000_000n, workerPaid: 10_000_000n, buyerRefunded: 20_000_000n, deadline: 2_000_000_000n,
      qualityThresholdBps: 8000, checkpointCount: 2, deposited: true, paused: true, finalized: true,
      specHash: `0x${'22'.repeat(32)}`, weights: [2000, 8000], bpsReleasedPerCp: [1000, 0],
    });
    const settlement = evaluateContract(contract);
    expect(contract.checkpoints.map((checkpoint) => checkpoint.weight)).toEqual([20, 80]);
    expect(settlement).toMatchObject({ status: 'refunded', releasedAmount: 10, refundableAmount: 20, lockedAmount: 70 });
    expect(contract.checkpoints[1].evidence).not.toMatch(/rejected/i);
  });
});
