import type { ScaffoldEscrowProgram, EscrowAccount } from './program';
import { PublicKey } from '@solana/web3.js';

export type LeaderboardRow = {
  worker: PublicKey;
  totalReleasedUsdc: number;
  jobs: number;
  finalizedJobs: number;
};

export async function fetchAllEscrows(program: ScaffoldEscrowProgram): Promise<EscrowAccount[]> {
  const accounts = await program.account.escrow.all();
  return accounts.map((a) => a.account);
}

export function rankWorkers(escrows: EscrowAccount[]): LeaderboardRow[] {
  const byWorker = new Map<string, LeaderboardRow>();
  for (const e of escrows) {
    const key = e.worker.toBase58();
    const released = e.released.toNumber() / 1_000_000;
    const row = byWorker.get(key) ?? {
      worker: e.worker,
      totalReleasedUsdc: 0,
      jobs: 0,
      finalizedJobs: 0,
    };
    row.totalReleasedUsdc += released;
    row.jobs += 1;
    if (e.finalized) {
      row.finalizedJobs += 1;
    }
    byWorker.set(key, row);
  }
  return [...byWorker.values()].sort((a, b) => b.totalReleasedUsdc - a.totalReleasedUsdc);
}
