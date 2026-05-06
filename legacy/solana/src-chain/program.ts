import { AnchorProvider, Program } from '@coral-xyz/anchor';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import type { Connection, PublicKey } from '@solana/web3.js';

import idl from '../idl/scaffold_escrow.json';
import type { ScaffoldEscrow } from '../idl/scaffold_escrow.types';

export type ScaffoldEscrowProgram = Program<ScaffoldEscrow>;

export type EscrowAccount = Awaited<
  ReturnType<ScaffoldEscrowProgram['account']['escrow']['fetch']>
>;

export function getProgram(connection: Connection, wallet: AnchorWallet): ScaffoldEscrowProgram {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  return new Program(idl as unknown as ScaffoldEscrow, provider);
}

export function fetchEscrowAccountNullable(
  program: ScaffoldEscrowProgram,
  escrowPk: PublicKey,
): Promise<EscrowAccount | null> {
  return program.account.escrow.fetchNullable(escrowPk);
}
