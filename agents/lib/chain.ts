import { readFileSync } from 'node:fs';
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toBytes,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

import { SCAFFOLD_ESCROW_ABI } from './scaffold-abi.js';

export type ChainName = 'base-sepolia' | 'base';

export function chainOf(name: ChainName) {
  return name === 'base' ? base : baseSepolia;
}

export function getChainNameFromEnv(): ChainName {
  return (process.env.CHAIN ?? 'base-sepolia') === 'base' ? 'base' : 'base-sepolia';
}

export function getRpcUrl(): string {
  return process.env.RPC_URL ?? (getChainNameFromEnv() === 'base' ? 'https://mainnet.base.org' : 'https://sepolia.base.org');
}

export function getEscrowAddress(): Address {
  const v = process.env.SCAFFOLD_ESCROW_ADDRESS;
  if (!v) throw new Error('SCAFFOLD_ESCROW_ADDRESS not set');
  return v as Address;
}

export function getUsdcAddress(): Address {
  const v = process.env.USDC_ADDRESS;
  if (v) return v as Address;
  return getChainNameFromEnv() === 'base'
    ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
    : '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
}

export function loadPrivateKey(envVar: string): Hex {
  const raw = process.env[envVar];
  if (!raw) throw new Error(`${envVar} not set`);
  if (raw.startsWith('0x')) return raw as Hex;
  // Allow specifying a file path with a hex private key.
  return readFileSync(raw, 'utf8').trim() as Hex;
}

export type ChainCtx = {
  pub: PublicClient;
  wal: WalletClient;
  account: ReturnType<typeof privateKeyToAccount>;
};

export function buildClients(privateKeyEnv: string): ChainCtx {
  const chain = chainOf(getChainNameFromEnv());
  const rpc = getRpcUrl();
  const account = privateKeyToAccount(loadPrivateKey(privateKeyEnv));
  const pub = createPublicClient({ chain, transport: http(rpc) }) as unknown as PublicClient;
  const wal = createWalletClient({ chain, transport: http(rpc), account }) as unknown as WalletClient;
  return { pub, wal, account };
}

export function jobIdFor(buyer: Address, nonce: bigint): Hex {
  const buyerBytes = toBytes(buyer);
  const nonceHex = nonce.toString(16).padStart(64, '0');
  return keccak256(new Uint8Array([...buyerBytes, ...toBytes(`0x${nonceHex}`)])) as Hex;
}

export { SCAFFOLD_ESCROW_ABI };
