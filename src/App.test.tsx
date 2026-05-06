import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';

import App from './App';

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
});
