# Scaffold — verified live demo on Base Sepolia

> **All addresses and tx hashes below are real, on Base Sepolia (chain id 84532).** Every link goes to Basescan. The whole flow ran end-to-end without a human in the loop.

## Deployment

| Contract | Address | Basescan |
|---|---|---|
| `ScaffoldEscrow` | `0xA1e78f0B227feB3a3043302Afb0A45bC5381af32` | https://sepolia.basescan.org/address/0xA1e78f0B227feB3a3043302Afb0A45bC5381af32 |
| Circle USDC (Base Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e |

## Wallets

| Role | Address | Basescan |
|---|---|---|
| Buyer | `0x55981b98768fF51DA43a67d7BB371707C5A8307b` | https://sepolia.basescan.org/address/0x55981b98768fF51DA43a67d7BB371707C5A8307b |
| Worker | `0xd3df327BFa53E30dA2ad81141Cd839B2b0271Dd3` | https://sepolia.basescan.org/address/0xd3df327BFa53E30dA2ad81141Cd839B2b0271Dd3 |
| Arbiter | `0xFD68e720D5bEBBa75f0C1bcd98238Bc578BF0A10` | https://sepolia.basescan.org/address/0xFD68e720D5bEBBa75f0C1bcd98238Bc578BF0A10 |

Wallets funded via the **Coinbase Developer Platform faucet** programmatically (`scripts/fund-via-cdp.ts`).

## End-to-end flow on Base Sepolia

Job ID `0x3c2a40c43488dc9047f084d295efcd14ce1d1e1c16e0571be08fcc945f8e4091`, budget 2 USDC, 9 checkpoints, threshold 80%.

### Act 0 — initialize + approve + deposit (buyer)

| Step | Tx |
|---|---|
| `initialize` | https://sepolia.basescan.org/tx/0x44e053c0b9c0112cf2147e550d4d6238f6f8f938809fe55dae6d17abdbf0e731 |
| `approve` | https://sepolia.basescan.org/tx/0xc725da1096e378c66e3434fa459b918a505ca2deb2c7479fc3f9b5daf97801b1 |
| `deposit` | https://sepolia.basescan.org/tx/0xeb7ac6efbee76fce00ddbc1114ba0611f352ce2d12823910a7be02810c2c2d15 |

### Act 1 — streaming first 4 checkpoints to 100% (arbiter)

| cp | bps | Tx |
|---|---|---|
| 0 (spec) | 1000 | https://sepolia.basescan.org/tx/0xb66b1b8e3f223605dd3c0475b7ff32b9c42856bd7d958a5497fec545753c96a3 |
| 1 (copy) | 800 | https://sepolia.basescan.org/tx/0x51166ab7a0088093f6276d12df9e794815e1b79d5dc28180a6f26b562b6fa80a |
| 2 (responsive) | 800 | https://sepolia.basescan.org/tx/0x6524f412f207d025030324da6fcb1ad3567710896f599d3e27403d0c1e3f3706 |
| 3 (links) | 600 | https://sepolia.basescan.org/tx/0xd99f61c0a47fbeda69c7c72301e348c4d196c56bc7bddd8a2a9cc626f95a730c |

### Act 2 — failure (pause stream)

| Step | Tx |
|---|---|
| `setPause(true)` | https://sepolia.basescan.org/tx/0x8ef0bb9b23265b1b6ac6380c6e7005f462623f49b7dd60e6984bdabbf7d01d1f |

### Act 3 — recovery: unpause + remaining 5 checkpoints stream at 80% then 100%

| Step | Tx |
|---|---|
| `setPause(false)` | https://sepolia.basescan.org/tx/0x1eba503a117615962161f64ebee25158f65815576a5035b7550a51eaff6a70c0 |
| cp 4 (performance) @ 80% | https://sepolia.basescan.org/tx/0xe37837ceb371500ab6b33c5d4ce50e24e827012e29378af84d0bdf6362ccd06d |
| cp 4 @ 100% | https://sepolia.basescan.org/tx/0xd3921551d2d5c87adbf2a0688a291d10c38daab1ec51388bfef8fb55dbe019ba |
| cp 5 (deploy) @ 80% | https://sepolia.basescan.org/tx/0x6329dc6a4627fdac42c953443b80e6de90f3b178f40f689fb12c787f60f9e606 |
| cp 5 @ 100% | https://sepolia.basescan.org/tx/0x2b1d30f35e82478b15edcdea9510336ea929d261ad14644d8205b463818de3f1 |
| cp 6 (handoff) @ 80% | https://sepolia.basescan.org/tx/0x92856c8f7331c8fa89eee293c3e5c835966476ee4258b67608ee155a78c40114 |
| cp 6 @ 100% | https://sepolia.basescan.org/tx/0x7e8ef01987b7e1aef6688be1722b9c20820b207a13ba5406dea823e9c6171e6d |
| cp 7 (audit) @ 80% | https://sepolia.basescan.org/tx/0x0dcdfabfbfe578bfbe051f00f5fd775837e8c0470a44a0886bd9ffb86712fa35 |
| cp 7 @ 100% | https://sepolia.basescan.org/tx/0x82482b9eee97b942cca1a99d53663db8dcc88b6e9af0efddb705cad85b0cff59 |
| cp 8 (agent-repair-loop) @ 80% | https://sepolia.basescan.org/tx/0x96ceb401a7b71e88ef5aa6643e002fb55bff321c54fe656c771c35e2859859f1 |
| cp 8 @ 100% | https://sepolia.basescan.org/tx/0xb8228f4b8e3a2ac3fdf5a161b2bc50c93bb5cf35e8d7f462b24d28dcb7c7b044 |

### Final — anyone-cranked finalize

| Step | Tx |
|---|---|
| `finalizeJob` | https://sepolia.basescan.org/tx/0x22451b4f8fed5d360104303ece231661060e2683ee289c088315b9af96735f1f |

## Verified post-flow state

```
=== Job state (live on Base Sepolia) ===
  budget:        2_000_000  (2 USDC)
  released:      2_000_000  (full budget streamed to worker)
  deposited:     true
  paused:        false
  finalized:     true
  cpCount:       9
  thresholdBps:  8000  (80% — met → surplus to worker)

=== USDC balances on Base Sepolia ===
  buyer:   started 8 USDC, ended 1 USDC (deposited 7 across 2 jobs)
  worker:  ended 2.5 USDC (0.5 from a partial earlier job + 2.0 from this run)
  escrow:  4.5 USDC residual (from a different job that was deposited but not finalized)
```

## Total tx count on real Base Sepolia for the demo

**21 transactions** across deploy + 3 acts + finalize, all signed by the three demo wallets, all confirmed by the Base Sepolia sequencer:

1 deploy + 1 init + 1 approve + 1 deposit + 4 streaming releases + 1 pause + 1 unpause + 10 partial-then-full releases + 1 finalize = 21.

## x402 paywall surface (separate process, also verified)

The Bedrock-judged verifier is paywalled with `x402-express`:

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
```
```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [{
    "scheme": "exact",
    "network": "base-sepolia",
    "maxAmountRequired": "1000",
    "resource": "http://localhost:4021/score",
    "description": "Structured AI scoring of an artifact (Bedrock-judged).",
    "payTo": "0xFD68e720D5bEBBa75f0C1bcd98238Bc578BF0A10",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "extra": { "name": "USDC", "version": "2" }
  }]
}
```

`/pricing` is the agent-economic-reasoning surface. Workers can discover the per-call USDC cost, the network, and the facilitator URL before deciding which verifier to call.

## How each judging criterion is hit

| Criterion | Evidence |
|---|---|
| **x402 + Base** | All 21 demo txs above, on Base Sepolia. The verifier API is paywalled with `x402-express`, asset = real Circle USDC on Base Sepolia. |
| **AWS** | `agents/lib/bedrock.ts` (Bedrock Converse + tool use). `infra/lib/scaffold-stack.ts` (CDK: Lambda + API Gateway + CloudFront + DynamoDB + IAM scoping). |
| **Innovation + real-world relevance** | A composable primitive any agent marketplace can mount. 8 passing Foundry tests + a working live deployment. |
| **Reusability + developer enablement** | `agents/lib/` is a reusable agent toolkit. `contracts/` is independently usable. CDK template ready to deploy. `scripts/fund-via-cdp.ts` is a reusable CDP-faucet helper. |
| **Economic reasoning** | `/pricing` endpoint returns the price catalog so workers can compare. `BEDROCK_MODEL` env picks Nova Pro vs Lite vs Claude per tick. |
| **Kiro** | `.kiro/specs/scaffold.md` is the durable architecture spec. |

## Reproduction (real Base Sepolia)

```bash
# 1. Install + build
npm install
forge install --root contracts OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std
forge build --root contracts

# 2. Generate three EVM keypairs + populate .env
cast wallet new --json > /tmp/buyer.json
cast wallet new --json > /tmp/worker.json
cast wallet new --json > /tmp/arbiter.json
# (write addresses + private keys into .env — see .env.example)

# 3. Fund all three via CDP (free, programmatic, no browser captcha)
#    Place your CDP API key json at cdp_api_key.json (gitignored), then:
npx tsx scripts/fund-via-cdp.ts
TARGET_USDC=8 npx tsx scripts/topup-usdc.ts

# 4. Deploy ScaffoldEscrow
DEPLOYER_PRIVATE_KEY=$(grep '^BUYER_PRIVATE_KEY=' .env | cut -d= -f2) \
  forge script script/Deploy.s.sol:Deploy --rpc-url https://sepolia.base.org --broadcast \
  --root contracts

# 5. Run the 3-act demo
NONCE=$(date +%s) BUDGET_USDC=2 npm run agent:demo

# 6. Start the verifier API for x402 + Bedrock demonstration
npm run agent:verifier:server &
curl -sS http://localhost:4021/pricing | jq
curl -sS -i -X POST http://localhost:4021/score -H 'content-type: application/json' -d '{}'
```
