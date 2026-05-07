import { type ReactNode } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme, connectorsForWallets } from '@rainbow-me/rainbowkit';
import { injectedWallet } from '@rainbow-me/rainbowkit/wallets';

import '@rainbow-me/rainbowkit/styles.css';

// Only injectedWallet is used so the dApp doesn't depend on a WalletConnect
// Cloud project ID. MetaMask + Coinbase Wallet + Rainbow all support EIP-1193
// injection and connect through this single wallet entry. Set
// VITE_WALLETCONNECT_PROJECT_ID later if you want to add WC-based connectors.
const connectors = connectorsForWallets(
  [{ groupName: 'Browser', wallets: [injectedWallet] }],
  { appName: 'Scaffold', projectId: 'no-walletconnect' },
);

const config = createConfig({
  connectors,
  chains: [baseSepolia, base],
  transports: {
    [baseSepolia.id]: http(),
    [base.id]: http(),
  },
  ssr: false,
});

const queryClient = new QueryClient();

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({ accentColor: '#d4a853', borderRadius: 'medium' })}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
