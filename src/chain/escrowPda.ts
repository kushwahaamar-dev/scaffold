import BN from 'bn.js';
import { PublicKey } from '@solana/web3.js';

import { PROGRAM_ID } from './config';

export function escrowPda(buyer: PublicKey, nonce: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), buyer.toBuffer(), nonce.toArrayLike(Buffer, 'le', 8)],
    PROGRAM_ID,
  );
}
