/**
 * One-shot funding via Coinbase Developer Platform faucet.
 * Reads cdp_api_key.json (gitignored), drips Base Sepolia ETH + USDC to the
 * three demo wallets, prints tx hashes and final balances.
 */
import { readFileSync } from 'node:fs';
import { CdpClient } from '@coinbase/cdp-sdk';
import { createPublicClient, formatEther, formatUnits, http, type Address } from 'viem';
import { baseSepolia } from 'viem/chains';

type CdpKey = { id: string; privateKey: string };

async function main() {
  const cdp: CdpKey = JSON.parse(readFileSync('cdp_api_key.json', 'utf8'));

  const client = new CdpClient({
    apiKeyId: cdp.id,
    apiKeySecret: cdp.privateKey,
  });

  const targets: Array<{ name: string; address: Address }> = [
    { name: 'buyer',   address: '0x55981b98768fF51DA43a67d7BB371707C5A8307b' },
    { name: 'worker',  address: '0xd3df327BFa53E30dA2ad81141Cd839B2b0271Dd3' },
    { name: 'arbiter', address: '0xFD68e720D5bEBBa75f0C1bcd98238Bc578BF0A10' },
  ];

  const network = 'base-sepolia';

  console.log('=== Requesting Base Sepolia ETH for all 3 wallets ===');
  for (const t of targets) {
    try {
      const tx = await client.evm.requestFaucet({ address: t.address, network, token: 'eth' });
      console.log(`  ${t.name}  ETH faucet tx: ${tx.transactionHash}`);
    } catch (e) {
      console.warn(`  ${t.name}  ETH faucet FAILED: ${(e as Error).message}`);
    }
  }

  console.log('\n=== Requesting Base Sepolia USDC for the BUYER ===');
  try {
    const buyer = targets[0].address;
    const tx = await client.evm.requestFaucet({ address: buyer, network, token: 'usdc' });
    console.log(`  buyer USDC faucet tx: ${tx.transactionHash}`);
  } catch (e) {
    console.warn(`  buyer USDC faucet FAILED: ${(e as Error).message}`);
  }

  console.log('\n=== Waiting ~10s for confirmations + reading balances ===');
  const pub = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') });
  const usdc = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address;

  await new Promise((r) => setTimeout(r, 10_000));

  for (const t of targets) {
    const ethWei = await pub.getBalance({ address: t.address });
    console.log(`  ${t.name}  ${t.address}  ${formatEther(ethWei)} ETH`);
  }
  const buyerUsdc = await pub.readContract({
    address: usdc,
    abi: [{
      type: 'function', name: 'balanceOf', stateMutability: 'view',
      inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }],
    }],
    functionName: 'balanceOf',
    args: [targets[0].address],
  });
  console.log(`  buyer USDC: ${formatUnits(buyerUsdc as bigint, 6)} USDC`);
}

main().catch((e) => {
  console.error('fund-via-cdp fatal:', e);
  process.exit(1);
});
