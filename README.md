# Scaffold

> **Stripe for verified work.** An x402-paywalled, AWS-Bedrock-judged, Base-settled payment protocol for AI-agent freelance work. Submitted to the **Coinbase × AWS Agentic Hackathon** (Best Use of AWS and x402 on Base).

[![ci](https://github.com/kushwahaamar-dev/scaffold/actions/workflows/ci.yml/badge.svg)](https://github.com/kushwahaamar-dev/scaffold/actions/workflows/ci.yml)

```
┌────────────┐    POST /score (HTTP 402)            ┌──────────────────┐
│ Worker     │ ───────────────────────────────────► │ x402 paywall     │
│ agent      │ ◄── price: $0.001 USDC, network: base│ (CloudFront +    │
│ (Bedrock)  │                                       │  API Gateway)    │
│            │ ─── retry with X-PAYMENT header ────► │                  │
└────────────┘                                       └────────┬─────────┘
                                                              │
                                                              ▼
                                                    ┌─────────────────┐
                                                    │ Lambda          │
                                                    │  · Bedrock      │
                                                    │    invokeModel  │
                                                    │  · DynamoDB     │
                                                    │    audit log    │
                                                    │  · viem         │
                                                    │    releaseStreamed│
                                                    └────────┬────────┘
                                                              │
                                                              ▼
                                                    ┌─────────────────┐
                                                    │ ScaffoldEscrow  │
                                                    │   on Base       │
                                                    │   (USDC)        │
                                                    └─────────────────┘
```

The **buyer** funds an escrow on Base. The **worker** produces an artifact (Bedrock-generated). The **verifier API** is paywalled with x402 — every score request costs USDC, settled by the x402 Facilitator on Base. Inside the Lambda, Bedrock returns a structured score per checkpoint; the same Lambda (acting as arbiter) calls `releaseStreamed` on Base, paying the worker the **delta** since the last score. After the deadline OR when fully scored, **anyone** can crank `finalizeJob`, which routes the surplus to the worker if the quality threshold was hit, or back to the buyer otherwise. Reputation = lifetime released USDC, indexed off `ReleaseStreamed` events.

## Hitting the judging criteria

| Criterion                                                  | Where it's evidenced                                                                                                                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Effective use of x402**                                  | `agents/verifier-server.ts` — `x402-express` middleware, `/pricing` discovery endpoint, x402 facilitator URL configurable. `agents/verifier-client.ts` — `x402-fetch` worker.    |
| **Effective use of AWS**                                   | `agents/lib/bedrock.ts` (Bedrock Converse API + tool use); `infra/lib/scaffold-stack.ts` (CDK: Lambda + API Gateway + CloudFront + DynamoDB + IAM scoping).                       |
| **Innovation + real-world relevance**                      | A non-trivial composable primitive: any agent marketplace can mount this verifier API. No "hello world" — the contract has 8 passing Foundry tests covering streaming + finalize. |
| **Reusability + developer enablement**                     | The verifier API is a black-box service. The agent toolkit (`agents/lib/`) is reusable. The Solidity contract is independently usable. CDK template ships ready to deploy.        |
| **Economic reasoning for agents**                          | `/pricing` is the surface where workers compare cost vs. quality. `verifier-client.ts` reads pricing before paying — extension point for choosing Nova Lite vs. Pro by budget.    |
| **Effective use of Kiro**                                  | `.kiro/specs/scaffold.md` is the durable architecture spec. The README's *Demo script* section walks the judge through the Kiro commands used to scaffold, test, and deploy.       |

## Repository layout

```
scaffold/
├── contracts/                    Foundry — Solidity escrow on Base
│   ├── src/ScaffoldEscrow.sol         score-scaled streaming USDC
│   ├── test/ScaffoldEscrow.t.sol      8 tests, all pass
│   ├── script/Deploy.s.sol            forge script for Base Sepolia / mainnet
│   └── foundry.toml
├── src/                          Vite + React 19 + wagmi + RainbowKit
│   ├── chain/{config,abi}.ts
│   ├── components/{OnChainEscrow,Leaderboard}.tsx
│   ├── domain/scaffold.ts             pure-TS spec engine + tests
│   ├── wallet/AppProviders.tsx        wagmi + RainbowKit
│   └── App.{tsx,test.tsx}
├── agents/                       Off-chain Node + Bedrock + x402
│   ├── lib/bedrock.ts                 single-tool forced-call helper
│   ├── lib/chain.ts                   viem clients, jobIdFor, ABI re-export
│   ├── lib/scaffold-abi.ts            pruned ABI mirror
│   ├── spec.example.json              9-checkpoint rubric, weights = 10000 bps
│   ├── worker.ts                      Bedrock generates the HTML artifact
│   ├── verifier-server.ts             Express + x402-express + Bedrock + viem
│   ├── verifier-client.ts             worker side; x402-fetch + Bedrock pricing reasoning
│   └── demo-runner.ts                 deterministic 3-act on-chain run
├── infra/                        AWS CDK
│   ├── bin/scaffold.ts
│   ├── lib/scaffold-stack.ts          Lambda + API GW + CloudFront + DynamoDB
│   └── package.json
├── .kiro/specs/scaffold.md       Kiro-readable architecture spec
├── legacy/solana/                Original Solana/Anchor implementation, kept for reference
└── .github/workflows/ci.yml
```

## Setup

### Prerequisites
- Node 20+
- [Foundry](https://book.getfoundry.sh/) (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- AWS account with Bedrock model access enabled (Anthropic Claude + Amazon Nova)
- Base Sepolia RPC (default `https://sepolia.base.org` works)
- Base Sepolia ETH for gas (https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)
- Base Sepolia USDC (https://faucet.circle.com/ → *Solana → swap to → Base Sepolia*; mint `0x036CbD53842c5426634e7929541eC2318f3dCF7e`)

### Install + build

```bash
npm install
npm run contracts:build
npm run contracts:test         # 8/8 pass
npm run lint                   # tsc front-end + tsc agents
npm test                       # vitest 5/5
npm run build                  # vite production
```

### Deploy the escrow

```bash
cp .env.example .env           # fill in DEPLOYER_PRIVATE_KEY
npm run contracts:deploy:sepolia
# copy the deployed address into VITE_ESCROW_ADDRESS_SEPOLIA + SCAFFOLD_ESCROW_ADDRESS
```

### Deploy the verifier (AWS)

```bash
cd infra
npm install
npx cdk bootstrap              # one-time per account/region
npx cdk deploy
# CloudFront + API Gateway URL printed; export it as VERIFIER_URL
```

### Run the dashboard

```bash
npm run dev
# http://localhost:5173 — Connect Wallet, switch to Base Sepolia, drive the flow
```

## Run the demo (3 minutes)

### 1) Worker generates an artifact via Bedrock

```bash
npm run agent:worker
# wrote agents/output/index.html (4823 bytes) via us.amazon.nova-pro-v1:0
```

### 2) Start the x402 verifier API locally

```bash
npm run agent:verifier:server
# [verifier] listening on :4021 · x402 pay-to=0x... · network=base-sepolia
```

### 3) The worker pays per score tick

```bash
npm run agent:verifier:client
# [client] verifier /pricing → $0.001/call on base-sepolia
# [client] streaming verification every 30000ms against job 0x...
# [client] scored 9 checkpoints; settlement_txs=4
```

Each tick:
1. Worker reads `/pricing` (free, agent-economic-reasoning surface).
2. Worker `fetchWithPayment(/score)` — first attempt returns 402, x402-fetch signs and retries with the X-PAYMENT header.
3. The x402 facilitator settles the per-call USDC fee on Base.
4. Lambda invokes Bedrock with the `submit_scores` tool.
5. Lambda inspects current on-chain progress per checkpoint.
6. For any forward-progress checkpoint, Lambda calls `ScaffoldEscrow.releaseStreamed(jobId, idx, score_bps)`.
7. Worker receives delta USDC.

### 4) Failure act

```bash
FAIL_MODE=1 npm run agent:worker     # ships a deliberately broken artifact
# verifier scores it low → arbiter `setPause` (or score never rises to threshold)
# stream stops; vault USDC is still locked
```

### 5) Finalize

In the dashboard, click *Finalize · route surplus by quality*. Anyone can crank — the outcome is fully determined by on-chain state. If `total_bps_released >= quality_threshold_bps`, the surplus goes to the worker (quality bonus); otherwise it returns to the buyer.

### 6) Autonomous on-chain demo (no LLM)

Wallet-and-Bedrock setup taking too long for the pitch? `agent:demo` runs the same 3-act flow deterministically, in ~30s, against the deployed contract:

```bash
BUYER_PRIVATE_KEY=0x... \
WORKER_ADDRESS=0x... \
ARBITER_PRIVATE_KEY=0x... \
SCAFFOLD_ESCROW_ADDRESS=0x... \
npm run agent:demo
```

## Contract reference

```solidity
function initialize(
    uint256 nonce,
    address worker,
    address arbiter,
    IERC20  token,                       // USDC
    uint256 budget,                      // 6 decimals
    uint64  deadline,                    // unix seconds
    uint16  qualityThresholdBps,         // 0..=10000
    uint8   checkpointCount,             // 1..=16
    uint16[16] calldata weights,         // sum of first checkpointCount = 10000
    bytes32 specHash                     // SHA-256 of off-chain spec JSON
) external returns (bytes32 jobId);

function deposit(bytes32 jobId) external;            // buyer
function releaseStreamed(bytes32, uint8 idx, uint16 scoreBps) external;  // arbiter
function setPause(bytes32 jobId, bool paused) external;                  // arbiter
function refundBuyer(bytes32 jobId) external;        // buyer; paused or past deadline
function finalizeJob(bytes32 jobId) external;        // anyone, post-deadline OR fully scored

function getJob(bytes32 jobId) external view returns (...);
function getCheckpointProgress(bytes32 jobId, uint8 idx) external view returns (uint16 weight, uint16 releasedBps);
```

`releaseStreamed` math (verbatim from `contracts/src/ScaffoldEscrow.sol:140`):

```
target = min(scoreBps, weight)
require(target > already, "NoForwardProgress");
amount = budget * (target − already) / 10_000
transfer(vault → worker, amount);
bps_released_per_cp[idx] = target;
```

## Tests + CI

```bash
forge test                  # 8 Solidity tests
npm test                    # 5 vitest tests
npm run lint                # 0 type errors front-end + agents
```

CI (`.github/workflows/ci.yml`) runs everything on every push.

## Security model

**Trusted assumptions**
- The buyer picks a trustworthy arbiter address at `initialize`.
- The arbiter's private key lives in the verifier Lambda (or wherever you deploy `verifier-server.ts`).
- The Base sequencer is honest (standard L2 trust assumption).

**Defended**
- Forward-progress only: a malicious arbiter can't replay an old release.
- Vault is the contract address — only the contract (not the arbiter) can move funds out.
- `finalizeJob` is permissionless; the outcome is computed entirely from on-chain state.
- `refundBuyer` is allowed only when paused OR past deadline.
- All releases use 256-bit math via `(budget * deltaBps) / 10000` — no overflow risk for any realistic budget.
- Weights validated to sum to exactly 10_000 bps at init; immutable after.

**Not yet (roadmap)**
- Permitless `releaseStreamed` via EIP-712 verifier signatures (so the Lambda doesn't have to hold ETH).
- Token-2022 / SPL transfer hooks for non-USDC stables.
- Per-checkpoint deterministic verifier types (Lighthouse, Playwright) so non-LLM checkpoints don't go through Bedrock at all.

## Roadmap

- [ ] Lambda@Edge variant of the x402 paywall for global low-latency settlement.
- [ ] DynamoDB-backed score audit log surfaced in the leaderboard panel.
- [ ] EIP-712 signed verifier receipts (anyone-can-crank `releaseStreamed`).
- [ ] Worker-side pricing strategy ("call Nova Pro only when threshold proximity > 0.7").
- [ ] Cross-chain (mirror the Anchor program in `legacy/solana/` and ship a single agent toolkit covering both).

## License

MIT — see `LICENSE`.

Built for the Coinbase × AWS Agentic Hackathon. Original Solana implementation preserved under `legacy/solana/`.
