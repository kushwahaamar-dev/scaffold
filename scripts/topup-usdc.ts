import { readFileSync } from 'node:fs';
import { CdpClient } from '@coinbase/cdp-sdk';
import { createPublicClient, formatUnits, http, type Address } from 'viem';
import { baseSepolia } from 'viem/chains';

const cdp = JSON.parse(readFileSync('cdp_api_key.json', 'utf8')) as { id: string; privateKey: string };
const client = new CdpClient({ apiKeyId: cdp.id, apiKeySecret: cdp.privateKey });
const buyer: Address = '0x55981b98768fF51DA43a67d7BB371707C5A8307b';
const usdc: Address = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

const target = Number(process.env.TARGET_USDC ?? '8');
const pub = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') });

async function readUsdc(): Promise<number> {
  const bal = await pub.readContract({
    address: usdc, functionName: 'balanceOf', args: [buyer],
    abi: [{ type: 'function', name: 'balanceOf', stateMutability: 'view',
      inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] }],
  });
  return Number(formatUnits(bal as bigint, 6));
}

(async () => {
  for (let i = 0; i < 12; i++) {
    const have = await readUsdc();
    console.log(`tick ${i}: buyer USDC = ${have}`);
    if (have >= target) { console.log('done'); break; }
    try {
      const tx = await client.evm.requestFaucet({ address: buyer, network: 'base-sepolia', token: 'usdc' });
      console.log(`  drip tx: ${tx.transactionHash}`);
    } catch (e) {
      console.warn(`  drip failed: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
})();
