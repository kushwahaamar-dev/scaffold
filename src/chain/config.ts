import { base, baseSepolia, type Chain } from 'viem/chains';
import type { Address } from 'viem';

export const SUPPORTED_CHAINS = [baseSepolia, base] as const;
export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

const env = import.meta.env;

export function getChain(): Chain {
  return (env.VITE_CHAIN ?? 'base-sepolia') === 'base' ? base : baseSepolia;
}

const ESCROW_DEFAULT: Record<number, Address | undefined> = {
  [baseSepolia.id]: env.VITE_ESCROW_ADDRESS_SEPOLIA as Address | undefined,
  [base.id]: env.VITE_ESCROW_ADDRESS_MAINNET as Address | undefined,
};

const USDC_DEFAULT: Record<number, Address> = {
  // Circle official USDC on Base Sepolia
  [baseSepolia.id]: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  // Circle official USDC on Base mainnet
  [base.id]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

export function escrowAddress(chainId: number): Address {
  const addr = ESCROW_DEFAULT[chainId];
  if (!addr) {
    throw new Error(
      `No ScaffoldEscrow address configured for chain ${chainId}. ` +
      `Set VITE_ESCROW_ADDRESS_SEPOLIA after deploying contracts/.`,
    );
  }
  return addr;
}

export function usdcAddress(chainId: number): Address {
  return USDC_DEFAULT[chainId] ?? USDC_DEFAULT[baseSepolia.id];
}

export function explorerTxUrl(chainId: number, hash: string): string {
  return chainId === base.id
    ? `https://basescan.org/tx/${hash}`
    : `https://sepolia.basescan.org/tx/${hash}`;
}

export function explorerAddressUrl(chainId: number, addr: string): string {
  return chainId === base.id
    ? `https://basescan.org/address/${addr}`
    : `https://sepolia.basescan.org/address/${addr}`;
}
