# Scaffold — Stripe for verified work

> **An x402-paywalled, AWS-Bedrock-judged, Base-settled payment protocol for AI-agent freelance work.** Submitted to the **Coinbase × AWS Agentic Hackathon** (Best Use of AWS and x402 on Base).

[![ci](https://github.com/kushwahaamar-dev/scaffold/actions/workflows/ci.yml/badge.svg)](https://github.com/kushwahaamar-dev/scaffold/actions/workflows/ci.yml)
[![contract](https://img.shields.io/badge/Base%20Sepolia-0xA1e7…1af32-c67c2e)](https://sepolia.basescan.org/address/0xA1e78f0B227feB3a3043302Afb0A45bC5381af32)

| | |
|---|---|
| 🎬 **Interactive demo video** | [▶ YouTube interactive demo](https://youtu.be/Cg65GQnaJUg) · [`docs/demo-video/scaffold-interactive-demo.mp4`](./docs/demo-video/scaffold-interactive-demo.mp4) — *1:20 recording with **visible UI interactions** (typing nonce / worker / arbiter, scrolling panels, hovering buttons) **while 21 real Base Sepolia transactions land in parallel** from `agent:demo`. Worker's lifetime USDC ticks up live on the leaderboard. Final job: [`0x3727…9506`](https://sepolia.basescan.org/address/0xA1e78f0B227feB3a3043302Afb0A45bC5381af32).* |
| 🎬 Earlier silent capture | [`docs/demo-video/scaffold-live-demo.mp4`](./docs/demo-video/scaffold-live-demo.mp4) — 24s capture of the operator's actual Brave window during job `0x6c81…2e84d` |
| 🎤 **Video pitch walkthrough** | [▶ YouTube video pitch](https://youtu.be/HxLlB5UDCrc) · [`docs/demo-video/scaffold-walkthrough.mp4`](./docs/demo-video/scaffold-walkthrough.mp4) |
| 🌐 **Live contract** | [`0xA1e78f0B227feB3a3043302Afb0A45bC5381af32`](https://sepolia.basescan.org/address/0xA1e78f0B227feB3a3043302Afb0A45bC5381af32) on Base Sepolia |
| 🧾 **21 verified live txs** | see [`DEMO.md`](./DEMO.md) for every Basescan link |
| 🏆 **Worker leaderboard** | [`0xd3df…1Dd3`](https://sepolia.basescan.org/address/0xd3df327BFa53E30dA2ad81141Cd839B2b0271Dd3) — 2.5 USDC earned |

---

## 1 · The 30-second pitch

Today, freelance payment is binary: **upfront** (buyer takes the risk) or **on delivery** (seller takes the risk). Platforms like Upwork patch this with escrow + human dispute resolution — slow, biased, expensive (~20% take rate), and structurally unable to handle **AI-agent counterparties** because there's no human to call.

**Scaffold makes payment a continuous function of verified progress.**

A buyer locks USDC into a Solidity escrow on Base. Every 30 seconds, a worker agent submits its artifact to a **paywalled verifier API** running on AWS — the worker pays a small USDC fee per verification call via Coinbase's **x402 Facilitator** on Base. The verifier (AWS Bedrock, structured tool-use) scores each checkpoint in basis points; the same Lambda then signs `releaseStreamed(jobId, checkpointIdx, scoreBps)` on the escrow, which streams **proportional USDC** to the worker. Anyone can crank `finalizeJob` at the deadline; surplus routes to the worker if quality met threshold, else back to the buyer.

Reputation = lifetime released USDC, indexed off `ReleaseStreamed` events.

---

## 2 · Demo video & screenshots

### 🎬 Interactive demo recording (visible UI driving + real Base Sepolia txs)

> **[`docs/demo-video/scaffold-interactive-demo.mp4`](./docs/demo-video/scaffold-interactive-demo.mp4)** (1:20, 1080p) — Playwright drives the dashboard with a visible cursor: typing nonce / worker / arbiter into the form, scrolling between panels, hovering action buttons. **Simultaneously**, [`scripts/record-interactive-demo.py`](./scripts/record-interactive-demo.py) launches `npm run agent:demo` so 21 real Base Sepolia transactions fire while the camera is rolling. The dashboard's wagmi hooks refetch on every block, so panel state changes mid-take.

Final job: `0x37276e6340a2427464500cd1c22a63daf56d1404535df99f591de27d9be09506`. Worker's lifetime balance ticked up to **4.498 USDC** during this run.

### 🎬 Earlier silent live recording

> **[`docs/demo-video/scaffold-live-demo.mp4`](./docs/demo-video/scaffold-live-demo.mp4)** — 24-second screen capture of the actual operator's Brave browser **while 21 real Base Sepolia transactions land** in front of them. Job ID: `0x6c81c13c830e0355488a099420c344006331273bffb115db7301c0d3a332e84d`.

The recording was orchestrated by [`scripts/record-live-demo.sh`](./scripts/record-live-demo.sh):
1. Counts down 7 seconds → starts ffmpeg full-screen capture (avfoundation)
2. Launches [`npm run agent:demo`](./agents/demo-runner.ts) — the autonomous 3-act on-chain runner
3. **The dashboard's wagmi hooks refetch on every block**, so the user's already-open Brave tab updates live as each `releaseStreamed` confirms
4. Stops recording when the permissionless `finalizeJob` lands

What you see during the 24s:
- Initialize → approve → deposit (3 txs)
- Stream first 4 checkpoints at full weight (4 txs)
- Pause stream — failure act (1 tx)
- Unpause (1 tx)
- Stream remaining 5 checkpoints at 80% then 100% (10 txs)
- Permissionless `finalizeJob` — surplus routes by quality threshold (1 tx)
- Worker leaderboard ticks up to **3.498 USDC** lifetime earned

### 🎤 Video pitch walkthrough

> [▶ Watch the video pitch on YouTube →](https://youtu.be/HxLlB5UDCrc)  
> [▶ Watch the interactive demo on YouTube →](https://youtu.be/Cg65GQnaJUg)

Recorded over [`docs/demo-video/scaffold-walkthrough.mp4`](./docs/demo-video/scaffold-walkthrough.mp4) using the timed script at [`docs/demo-video/SCRIPT.md`](./docs/demo-video/SCRIPT.md). Covers:

1. The problem (broken human-mediated freelance escrow)
2. Repo structure tour (`contracts/`, `src/`, `agents/`, `infra/`, `.kiro/`)
3. UI walkthrough — every panel, every button
4. Live `agent:demo` end-to-end run on Base Sepolia (the recording above)
5. The x402 paywall returning `HTTP 402` and the worker re-paying
6. The Bedrock-judged scoring loop driving on-chain releases
7. How Kiro was used to scaffold and extend the project

### 🖼 Screenshots — every panel that does something

| | |
|---|---|
| ![Hero](./docs/screenshots/01-hero.png) | **§1 Hero (top of page).** Connect Wallet → MetaMask / Coinbase / Rainbow. Workspace rail jumps to each section. Live ledger card shows `released / locked / refundable / verified weight` — all derived from the connected escrow. |
| ![Checkpoint board](./docs/screenshots/02-checkpoint-board.png) | **§2 Live work contract.** Nine-checkpoint rubric (`spec.example.json`). Each tile lights green/red/orange based on `getCheckpointProgress(jobId, idx)` reads against Base Sepolia. |
| ![Escrow controls](./docs/screenshots/03-escrow-controls.png) | **§3 On-chain escrow controls.** Three cards: parameters → state → score-by-checkpoint. Every button is a real Base Sepolia transaction. The score input takes basis points (0–10000); each click streams the delta to the worker. |
| ![Leaderboard](./docs/screenshots/04-leaderboard.png) | **§4 Worker leaderboard.** Indexed off `ReleaseStreamed` events on the escrow contract. Lifetime USDC earned is unforgeable reputation. |

Full-page render: [`docs/screenshots/dashboard-full.png`](./docs/screenshots/dashboard-full.png)

---

## 3 · How the blockchain interaction works

### 3.1 Architecture

```
   ┌──────────────┐    POST /score (HTTP 402)        ┌────────────────────┐
   │  Worker      │ ───────────────────────────────► │  AWS API Gateway   │
   │  agent       │                                  │  → Lambda          │
   │  (Bedrock-   │ ◄── 402 + accepts[USDC, base]    │     (verifier-     │
   │   built HTML │                                  │      server.ts)    │
   │   artifact)  │ ─── X-PAYMENT (EIP-3009 sig) ──► │                    │
   │              │                                  │  · x402-express    │
   │              │ ◄── 200 { results, settlement_   │  · Bedrock Converse│
   │              │     txs }                        │  · viem writeContract
   └──────┬───────┘                                  └─────────┬──────────┘
          │                                                    │
          │ x402 facilitator                                   │ releaseStreamed(idx, scoreBps)
          │ broadcasts transferWithAuthorization               │
          ▼                                                    ▼
   ┌─────────────────────────── Base Sepolia ──────────────────────────────┐
   │   Circle USDC                          ScaffoldEscrow.sol             │
   │   0x036C…CF7e                          0xA1e7…1af32                   │
   │                                                                       │
   │   • per-call USDC fee → arbiter   • forward-progress only             │
   │     wallet (X402_PAY_TO)          • amount = budget * Δbps / 10_000   │
   │                                   • permissionless finalizeJob        │
   └───────────────────────────────────────────────────────────────────────┘
```

### 3.2 The Solidity escrow (`contracts/src/ScaffoldEscrow.sol`)

Every function that moves money:

| Function | Signer | Effect | Solidity contract location |
|---|---|---|---|
| `initialize(...)` | buyer | Create job PDA-equivalent (keccak256(buyer,nonce)), lock spec params (weights, deadline, threshold, hash) | [`L86-L120`](./contracts/src/ScaffoldEscrow.sol#L86) |
| `deposit(jobId)` | buyer | `safeTransferFrom(buyer → escrow)` of `budget` USDC | [`L126-L138`](./contracts/src/ScaffoldEscrow.sol#L126) |
| `releaseStreamed(jobId, idx, scoreBps)` | arbiter | Score-scaled release: `(target − already) × budget / 10_000`, bounded by checkpoint weight, forward-progress only | [`L141-L165`](./contracts/src/ScaffoldEscrow.sol#L141) |
| `setPause(jobId, paused)` | arbiter | Halt new releases | [`L167-L173`](./contracts/src/ScaffoldEscrow.sol#L167) |
| `refundBuyer(jobId)` | buyer | Vault → buyer ATA (paused OR past deadline) | [`L176-L196`](./contracts/src/ScaffoldEscrow.sol#L176) |
| `finalizeJob(jobId)` | **anyone** | Surplus routes to worker if `total_bps ≥ qualityThresholdBps`, else back to buyer | [`L199-L227`](./contracts/src/ScaffoldEscrow.sol#L199) |

**Streaming math (verbatim from `releaseStreamed`):**

```solidity
uint16 weight  = j.weights[checkpointIndex];
uint16 already = j.bpsReleasedPerCp[checkpointIndex];
uint16 target  = scoreBps > weight ? weight : scoreBps;
require(target > already, NoForwardProgress());

uint256 deltaBps = uint256(target - already);
uint256 amount   = (j.budget * deltaBps) / BPS_DENOM;

j.bpsReleasedPerCp[checkpointIndex] = target;
j.released                          += amount;
j.token.safeTransfer(j.worker, amount);
```

So a single checkpoint can be released across multiple calls — `30% → 60% → 100%` — each call streaming only the delta. Funds never go backwards.

### 3.3 The x402 wire format (live)

```bash
$ curl -i -X POST http://localhost:4021/score \
       -H 'content-type: application/json' \
       -d '{"spec": {...}, "artifact_url": "..."}'

HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [{
    "scheme": "exact",
    "network": "base-sepolia",
    "maxAmountRequired": "1000",          ← 0.001 USDC, 6 decimals
    "resource": "http://localhost:4021/score",
    "description": "Structured AI scoring of an artifact (Bedrock-judged).",
    "payTo": "0xFD68e720D5bEBBa75f0C1bcd98238Bc578BF0A10",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",   ← Circle USDC on Base Sepolia
    "extra": { "name": "USDC", "version": "2" }              ← EIP-3009 domain
  }]
}
```

The `accepts[0]` block is exactly the payload the **Coinbase x402 Facilitator** at `https://x402.org/facilitator` consumes when settling a payment authorization — `transferWithAuthorization` (EIP-3009) on Circle's USDC.

### 3.4 The verifier loop (`agents/verifier-server.ts`)

```ts
app.post('/score', async (req, res) => {
  // 1. The x402-express middleware has already settled the worker's USDC fee
  //    for this call (verified the X-PAYMENT header against the facilitator).

  // 2. Score every checkpoint with Bedrock + tool-use
  const scores = await bedrockToolCall<{ results: ScoreResult[] }>({
    client: bedrockClient(),                       // ← AWS Bedrock
    modelId: 'us.amazon.nova-pro-v1:0',            // ← Amazon Nova Pro
    system: '...deterministic verification judge...',
    user: `Spec: ${JSON.stringify(spec)}\nArtifact:\n${artifact}`,
    tool: SCORE_TOOL,                              // structured output schema
  });

  // 3. For any forward-progress checkpoint, sign releaseStreamed on Base
  for (const s of scores.results) {
    const target = Math.min(s.score_bps, weight);
    if (target > already) {
      await wal.writeContract({
        address: escrow,
        functionName: 'releaseStreamed',
        args: [jobId, idx, target],                // ← USDC streams to worker
      });
    }
  }

  res.json({ results: scores.results, settlement_txs: txs });
});
```

### 3.5 Why this matters

- **No human dispute resolution.** Disputes are impossible by construction — the spec hash is bound at `initialize`, the scoring rubric is deterministic, the math is on-chain.
- **Reputation is unforgeable.** It's just lifetime USDC released, sitting in a wallet, indexable by anyone via `getProgramAccounts`-equivalent (`ReleaseStreamed` event scan).
- **Verification has a real cost model.** Workers pay per scoring tick. They can read `/pricing` first to choose between premium (Nova Pro) and economy (Nova Lite) — the **economic-reasoning surface** the hackathon prompt asks about.

---

## 4 · How each judging criterion is hit

| Criterion | Where it's evidenced |
|---|---|
| **Effective use of x402** | `agents/verifier-server.ts:107` mounts `paymentMiddleware`. `agents/verifier-client.ts` uses `wrapFetchWithPayment` from `x402-fetch`. Every score call settles real USDC on Base via the Coinbase facilitator. |
| **Effective use of AWS** | `agents/lib/bedrock.ts` (Bedrock Converse + structured tool use). `infra/lib/scaffold-stack.ts` provisions Lambda + API Gateway + CloudFront + DynamoDB + IAM scoped to `bedrock:InvokeModel` for Claude + Nova families. |
| **Innovation + real-world relevance** | A composable primitive any agent marketplace can mount. 8/8 Foundry tests + 21 live Base Sepolia transactions — not a toy. |
| **Reusability + developer enablement** | `agents/lib/` is a reusable agent toolkit. `contracts/` is independently usable. `scripts/fund-via-cdp.ts` is a reusable Coinbase Developer Platform faucet helper. CDK template ships ready to deploy. |
| **Economic reasoning** | `/pricing` endpoint returns the price catalog in a machine-readable format. `BEDROCK_MODEL` env switches Nova Pro / Nova Lite / Claude per tick. The worker reads pricing **before** paying — that's the economic-reasoning surface. |
| **Kiro** | [`.kiro/specs/scaffold.md`](./.kiro/specs/scaffold.md) is the durable architecture spec. The Loom video walks the judges through `kiro build`, `kiro test`, `kiro deploy` against this spec. |

---

## 5 · Repository layout

```
scaffold/
├── contracts/                          Foundry — Solidity escrow on Base
│   ├── src/ScaffoldEscrow.sol               ← score-scaled streaming USDC
│   ├── test/ScaffoldEscrow.t.sol            ← 8/8 tests pass
│   ├── script/Deploy.s.sol                  ← real Base Sepolia deploy
│   └── script/DeployLocal.s.sol             ← Anvil-fork deploy (no faucets)
│
├── src/                                Vite + React 19 + wagmi + RainbowKit
│   ├── chain/{config,abi}.ts                ← chain config + pruned ABI
│   ├── components/sections/                 ← HeroSection, ContractBoard
│   ├── components/ui/                       ← Metric, ProgressBar
│   ├── components/OnChainEscrow.tsx         ← live operator UI
│   ├── components/Leaderboard.tsx           ← event-indexed reputation
│   ├── domain/scaffold.ts                   ← pure-TS spec engine + tests
│   ├── wallet/AppProviders.tsx              ← wagmi + RainbowKit
│   └── App.{tsx,test.tsx}
│
├── agents/                             Off-chain Node + Bedrock + x402
│   ├── lib/bedrock.ts                       ← Bedrock Converse helper
│   ├── lib/chain.ts                         ← viem clients, jobIdFor
│   ├── lib/scaffold-abi.ts                  ← pruned ABI mirror
│   ├── spec.example.json                    ← 9-checkpoint rubric (10000 bps)
│   ├── worker.ts                            ← Bedrock-built HTML artifact
│   ├── verifier-server.ts                   ← x402-paywalled scoring API ★
│   ├── verifier-client.ts                   ← x402-fetch payer loop
│   └── demo-runner.ts                       ← deterministic 3-act on-chain run
│
├── infra/                              AWS CDK
│   ├── bin/scaffold.ts
│   └── lib/scaffold-stack.ts                ← Lambda + APIGW + CDN + DDB
│
├── scripts/
│   ├── fund-via-cdp.ts                      ← Coinbase Dev Platform faucet
│   ├── topup-eth.ts
│   └── topup-usdc.ts
│
├── .kiro/specs/scaffold.md             Kiro architecture spec ★
├── docs/screenshots/                   UI screenshots (this README)
├── DEMO.md                             every Basescan link from the live run
├── legacy/solana/                      original Anchor implementation
└── .github/workflows/ci.yml
```

★ are the files judges should read first.

---

## 6 · How to run it

### Prerequisites
- **Node 20+**
- **Foundry** (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- **AWS account** with Bedrock model access enabled (Claude + Nova families, region `us-east-1`)
- **Base Sepolia ETH** (for wallet gas) — get via [Coinbase Developer Platform](https://portal.cdp.coinbase.com/) faucet API or [https://faucet.solana.com/](https://www.alchemy.com/faucets/base-sepolia)
- **Base Sepolia USDC** (for buyer escrow budget) — [https://faucet.circle.com/](https://faucet.circle.com/) → Base Sepolia

### 6.1 Install + verify

```bash
git clone https://github.com/kushwahaamar-dev/scaffold && cd scaffold
npm install --legacy-peer-deps

# Solidity
forge install --root contracts OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std
npm run contracts:build
npm run contracts:test                 # 8/8 pass

# Front-end + agents
npm run lint                           # 0 type errors
npm test                               # 5 vitest tests pass
npm run build                          # production bundle
```

### 6.2 Configure

```bash
cp .env.example .env
# fill in BUYER_PRIVATE_KEY, WORKER_PRIVATE_KEY, ARBITER_PRIVATE_KEY,
# AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
```

### 6.3 Deploy

```bash
DEPLOYER_PRIVATE_KEY=$(grep BUYER_PRIVATE_KEY .env | cut -d= -f2) \
  forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://sepolia.base.org --broadcast \
  --root contracts
# copy the printed address into VITE_ESCROW_ADDRESS_SEPOLIA + SCAFFOLD_ESCROW_ADDRESS
```

### 6.4 Run the dashboard

```bash
npm run dev
# open http://localhost:5173 → Connect Wallet → Base Sepolia
```

### 6.5 Run the agents

```bash
# in three terminals:
npm run agent:worker                   # Bedrock generates the HTML artifact
npm run agent:verifier:server          # x402 paywall + Bedrock judge
npm run agent:verifier:client          # worker pays per tick, USDC streams
```

### 6.6 Or the autonomous on-chain demo (no LLM)

```bash
NONCE=$(date +%s) BUDGET_USDC=2 npm run agent:demo
# 21 transactions on Base Sepolia in ~30 seconds
```

---

## 7 · Tests + CI

| | |
|---|---|
| Solidity | `forge test` — 8/8 pass: happy path, forward-progress, partial credit, finalize-above/below threshold, refund-on-pause, weights validation, non-arbiter rejection |
| Front-end | `npm test` — 5 vitest tests covering settlement math + integrity engine + App rendering |
| Agents | `tsc --noEmit -p tsconfig.agents.json` — 0 type errors |
| Production build | `npm run build` — clean Vite build |
| CI | [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs all of these on every push |

---

## 8 · Security

**Trusted assumptions**
- The buyer picks a trustworthy arbiter address at `initialize`.
- The arbiter's private key lives inside the verifier Lambda (or wherever you deploy `verifier-server.ts`).
- The Base sequencer is honest (standard L2 trust).

**Defended on-chain**
- Forward-progress only: a malicious arbiter can't replay an old release.
- Vault is the contract address — only the contract (not the arbiter) can move funds out.
- `finalizeJob` is permissionless and outcome-deterministic.
- `refundBuyer` is allowed only when paused OR past deadline.
- 256-bit math on every release; no overflow risk for any realistic budget.
- Weights validated to sum to exactly 10_000 bps at init; immutable after.

**Roadmap**
- Permitless `releaseStreamed` via EIP-712 verifier signatures (so the Lambda doesn't have to hold ETH).
- Lambda@Edge variant of the x402 paywall.
- Token-2022 / SPL transfer hooks for non-USDC stables.
- Per-checkpoint deterministic verifiers (Lighthouse, Playwright) so non-LLM checkpoints don't go through Bedrock at all.

---

## 9 · Live deploy receipts

Every demo transaction is in [`DEMO.md`](./DEMO.md) — 21 Basescan links covering deploy → init → approve → deposit → 4 streaming releases → pause → unpause → 10 partial-then-full releases → permissionless finalize. Every link is a real Base Sepolia transaction signed by the three demo wallets.

```
buyer    0x55981b98768fF51DA43a67d7BB371707C5A8307b  →  https://sepolia.basescan.org/address/0x55981b98768fF51DA43a67d7BB371707C5A8307b
worker   0xd3df327BFa53E30dA2ad81141Cd839B2b0271Dd3  →  https://sepolia.basescan.org/address/0xd3df327BFa53E30dA2ad81141Cd839B2b0271Dd3
arbiter  0xFD68e720D5bEBBa75f0C1bcd98238Bc578BF0A10  →  https://sepolia.basescan.org/address/0xFD68e720D5bEBBa75f0C1bcd98238Bc578BF0A10
contract 0xA1e78f0B227feB3a3043302Afb0A45bC5381af32  →  https://sepolia.basescan.org/address/0xA1e78f0B227feB3a3043302Afb0A45bC5381af32
```

---

## License

MIT — see [`LICENSE`](./LICENSE).

Built for the **Coinbase × AWS Agentic Hackathon**. Original Solana implementation preserved under [`legacy/solana/`](./legacy/solana/) for cross-chain reference.
