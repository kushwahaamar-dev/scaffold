import { readFileSync } from 'node:fs';
import { CdpClient } from '@coinbase/cdp-sdk';
import { createPublicClient, formatEther, http, type Address } from 'viem';
import { baseSepolia } from 'viem/chains';

const cdp = JSON.parse(readFileSync('cdp_api_key.json', 'utf8')) as { id: string; privateKey: string };
const client = new CdpClient({ apiKeyId: cdp.id, apiKeySecret: cdp.privateKey });
const pub = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') });

const targets: Array<{ name: string; address: Address; targetEth: number }> = [
  { name: 'buyer',   address: '0x55981b98768fF51DA43a67d7BB371707C5A8307b', targetEth: 0.0005 },
  { name: 'worker',  address: '0xd3df327BFa53E30dA2ad81141Cd839B2b0271Dd3', targetEth: 0.0002 },
  { name: 'arbiter', address: '0xFD68e720D5bEBBa75f0C1bcd98238Bc578BF0A10', targetEth: 0.001 }, // many tx
];

(async () => {
  for (const t of targets) {
    for (let i = 0; i < 15; i++) {
      const wei = await pub.getBalance({ address: t.address });
      const eth = Number(formatEther(wei));
      console.log(`${t.name}: ${eth} ETH (target ${t.targetEth})`);
      if (eth >= t.targetEth) break;
      try {
        const tx = await client.evm.requestFaucet({ address: t.address, network: 'base-sepolia', token: 'eth' });
        console.log(`  drip tx: ${tx.transactionHash}`);
      } catch (e) {
        console.warn(`  drip failed: ${(e as Error).message}`);
        break;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
})();
