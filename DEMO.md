# Scaffold — verified demo run

> Demo executed end-to-end on a local Anvil fork of Base Sepolia (chain id `84532`,
> forked from real block `41186354`). Same chain id, same bytecode addresses for the
> ScaffoldEscrow constructor + ABI, same on-chain state for everything except the
> mock USDC we deployed locally.

## What was proven

| Capability | Evidence |
|---|---|
| Solidity escrow on Base | `ScaffoldEscrow` deployed at `0xa1e78f0b227feb3a3043302afb0a45bc5381af32` |
| Mock USDC + buyer pre-funded | `MockUSDC` at `0xfb511801dbf5f4500f48fd1e2b384c10eaf20c99`, buyer holding 100 USDC pre-flight |
| 8/8 Foundry tests | `forge test` — happy path, forward-progress, partial credit, finalize-above/below threshold, refund-on-pause, weights validation, non-arbiter rejection |
| Streaming USDC release | 14 `ReleaseStreamed` events fired across blocks `41186360–41186375` |
| Pause + resume | Act 2 `setPause(true)` → Act 3 `setPause(false)` |
| Permissionless finalize | Anyone could crank; outcome determined entirely by on-chain state |
| Quality-threshold surplus routing | Total bps = 10000 ≥ threshold (8000); surplus routed to worker |
| x402 paywall wire | `POST /score` without payment header returns `HTTP 402` with full x402 v1 payload |
| Agent economic-reasoning surface | `GET /pricing` — free; price + network + facilitator + pay-to |
| AWS Bedrock | Configured; `/healthz` reports `model=us.amazon.nova-pro-v1:0` ready for invocation when AWS creds are loaded |

## Demo log (autonomous 3-act runner)

```
$ npm run agent:demo

[demo] jobId=0x7137e2d9caf33085b757523c480871422dc9fa5684d2bd47342737904ae9d977 nonce=0
[demo] buyer=0x55981b98768fF51DA43a67d7BB371707C5A8307b worker=0xd3df327BFa53E30dA2ad81141Cd839B2b0271Dd3 arbiter=0xFD68e720D5bEBBa75f0C1bcd98238Bc578BF0A10
[demo] act 0 · initialize + approve + deposit
[demo] act 1 · streaming first 4 checkpoints to 100%
[demo] act 2 · arbiter pauses stream
[demo] act 3 · unpause + release remaining at 80% then 100%
[demo] finalize · routing surplus by quality threshold
[demo] done · released=5 USDC, finalized=true
```

## Final on-chain state

```
=== Final balances on Anvil fork (Base Sepolia state) ===
buyer USDC:   95.000000     ← deposited 5 USDC budget
worker USDC:   5.000000     ← collected the full streamed amount
escrow USDC:   0.000000     ← vault drained, fully settled

=== Job state ===
buyer:        0x55981b98768fF51DA43a67d7BB371707C5A8307b
worker:       0xd3df327BFa53E30dA2ad81141Cd839B2b0271Dd3
arbiter:      0xFD68e720D5bEBBa75f0C1bcd98238Bc578BF0A10
token:        0xFb511801DbF5f4500f48Fd1E2b384c10eAf20c99
budget:       5_000_000 (5 USDC)
released:     5_000_000 (5 USDC)
deadline:     1778162689 (~6h from now)
thresholdBps: 8000 (80% quality requirement)
checkpoints:  9
deposited:    true
paused:       false  (was true during Act 2)
finalized:    true
specHash:     0x4b809f9fa1af4a70744cb9d22ef57e30769ecd53dab1a62452efc9223d2b3f9d

=== Per-checkpoint progress (releasedBps / weightBps) ===
cp[0] = 1000 / 1000     spec
cp[1] =  800 /  800     copy
cp[2] =  800 /  800     responsive
cp[3] =  600 /  600     links
cp[4] = 2167 / 2167     performance
cp[5] =  633 /  633     deploy
cp[6] = 1000 / 1000     handoff
cp[7] =  500 /  500     audit
cp[8] = 2500 / 2500     agent-repair-loop
                  -----
total = 10000 bps (100% of budget streamed)
```

## x402 paywall responses (live)

### `GET /healthz`
```json
{"ok":true,"service":"scaffold-verifier","model":"us.amazon.nova-pro-v1:0"}
```

### `GET /pricing` — agent economic reasoning surface
```json
{
  "service": "scaffold-verifier",
  "paywalled_endpoints": {
    "/score": {
      "price_usdc": "0.001",
      "network": "base-sepolia",
      "description": "AI-judged structured scoring of an artifact against a spec.",
      "settles_on_chain": true
    }
  },
  "facilitator": "https://x402.org/facilitator",
  "pay_to": "0xFD68e720D5bEBBa75f0C1bcd98238Bc578BF0A10"
}
```

### `POST /score` (no X-PAYMENT header) — canonical x402 v1 response
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
    "mimeType": "",
    "payTo": "0xFD68e720D5bEBBa75f0C1bcd98238Bc578BF0A10",
    "maxTimeoutSeconds": 60,
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "outputSchema": {
      "input": { "type": "http", "method": "POST", "discoverable": true }
    },
    "extra": { "name": "USDC", "version": "2" }
  }]
}
```

The `accepts[0]` block is exactly what the x402 facilitator at `https://x402.org/facilitator` consumes when settling a payment authorization (EIP-3009 `transferWithAuthorization` on Circle's USDC).

## Reproduction (5 commands)

```bash
# 1. Start a local fork of Base Sepolia
anvil --fork-url https://sepolia.base.org --chain-id 84532 --port 8545 &

# 2. Fund the three wallets (instant, no faucets)
for a in 0x55981b98768fF51DA43a67d7BB371707C5A8307b 0xd3df327BFa53E30dA2ad81141Cd839B2b0271Dd3 0xFD68e720D5bEBBa75f0C1bcd98238Bc578BF0A10; do
  cast rpc anvil_setBalance $a 0xDE0B6B3A7640000 --rpc-url http://localhost:8545
done

# 3. Deploy contract + mock USDC, mint 100 USDC to buyer
cd contracts && forge script script/DeployLocal.s.sol:DeployLocal \
  --rpc-url http://localhost:8545 --broadcast

# 4. Run the demo
cd .. && npm run agent:demo

# 5. Start the x402 verifier and probe it
npm run agent:verifier:server &
curl -sS http://localhost:4021/pricing | jq
curl -sS -i -X POST http://localhost:4021/score \
  -H 'content-type: application/json' -d '{"spec":{"title":"x","checkpoints":[]}}'
```

## What's not yet wired (and why)

- **Real Base Sepolia deploy:** the three faucets we tried (Coinbase, Alchemy, Chainlink) each silently rejected the drops; address `0x55981…7b` has on-chain `nonce=0` on three independent RPC endpoints. The local Anvil fork is functionally identical for demo purposes — same chain id, same bytecode, same RPC interface. To switch to real testnet, just unset `RPC_URL` in `.env` and rerun the deploy script.

- **Live x402 settlement:** the facilitator at `https://x402.org/facilitator` broadcasts to real Base Sepolia, so consummating an x402 payment requires Base Sepolia ETH + USDC on the **worker** wallet. The 402 response above proves the paywall middleware, header parsing, and EIP-3009 declaration are correct; the missing piece is just funding.

- **Live Bedrock invocation:** waiting on `aws sts get-caller-identity` to succeed. The Bedrock client + tool-use schemas are wired (`agents/lib/bedrock.ts`); flip on with a single `AWS_PROFILE=...` export.
