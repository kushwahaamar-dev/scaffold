import { clusterApiUrl, PublicKey } from '@solana/web3.js';

export type SolanaCluster = 'devnet' | 'testnet' | 'mainnet-beta';

const DEFAULT_PROGRAM_ID = '4dUWewdZ6q1wXD8YxLJFrhWqqp6Gnk7TrXSD8WqDAMnG';
/** Circle devnet USDC (spl-token). */
const DEFAULT_USDC_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

export function getCluster(): SolanaCluster {
  const raw = import.meta.env.VITE_SOLANA_CLUSTER;
  if (raw === 'testnet' || raw === 'mainnet-beta') {
    return raw;
  }
  return 'devnet';
}

export function getRpcEndpoint(): string {
  const custom = import.meta.env.VITE_SOLANA_RPC;
  if (custom && custom.length > 0) {
    return custom;
  }
  return clusterApiUrl(getCluster());
}

export function getExplorerClusterQuery(): string {
  const cluster = getCluster();
  if (cluster === 'mainnet-beta') {
    return '';
  }
  return `?cluster=${cluster}`;
}

export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}${getExplorerClusterQuery()}`;
}

export function explorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}${getExplorerClusterQuery()}`;
}

export const PROGRAM_ID = new PublicKey(import.meta.env.VITE_PROGRAM_ID ?? DEFAULT_PROGRAM_ID);

export const USDC_MINT = new PublicKey(import.meta.env.VITE_USDC_MINT ?? DEFAULT_USDC_DEVNET);
