import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import BN from 'bn.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

import type { ScaffoldEscrow } from '../../src/idl/scaffold_escrow.types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const idlPath = resolve(__dirname, '../../src/idl/scaffold_escrow.json');
const idl = JSON.parse(readFileSync(idlPath, 'utf8')) as ScaffoldEscrow;

export type ScaffoldProgram = Program<ScaffoldEscrow>;
export type EscrowAccount = Awaited<ReturnType<ScaffoldProgram['account']['escrow']['fetch']>>;

export function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export function buildProgram(rpcUrl: string, signer: Keypair): { program: ScaffoldProgram; provider: AnchorProvider } {
  const connection = new Connection(rpcUrl, 'confirmed');
  const provider = new AnchorProvider(connection, new Wallet(signer), {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  const program = new Program<ScaffoldEscrow>(idl, provider);
  return { program, provider };
}

export function escrowPda(programId: PublicKey, buyer: PublicKey, nonce: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), buyer.toBuffer(), nonce.toArrayLike(Buffer, 'le', 8)],
    programId,
  );
}
