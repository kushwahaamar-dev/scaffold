# Scaffold

> **Stripe for verified work.** A Solana-native payment protocol for AI-agent (and human) freelance work. Spec is the contract, per-checkpoint score in basis points is the release authorization, and a permissionless `finalize_job` routes the surplus by an on-chain quality threshold. Reputation is the USDC a worker has earned — sitting in a wallet, unforgeable.

[![ci](https://github.com/kushwahaamar-dev/scaffold/actions/workflows/ci.yml/badge.svg)](https://github.com/kushwahaamar-dev/scaffold/actions/workflows/ci.yml)

---

## Table of contents

- [Why](#why)
- [How it works](#how-it-works)
- [Architecture](#architecture)
- [On-chain instructions](#on-chain-instructions)
- [Account layout](#account-layout)
- [Repo layout](#repo-layout)
- [Setup](#setup)
- [Run the demo](#run-the-demo)
- [Front-end behavior](#front-end-behavior)
- [Agents](#agents)
- [Tests + CI](#tests--ci)
- [Security model](#security-model)
- [Roadmap](#roadmap)
- [License](#license)

---

## Why

Today, freelance payments are binary and human-mediated:

- Pay upfront → buyer takes the risk of ghosting.
- Pay on delivery → seller takes the risk of non-payment or scope creep.
- Platforms (Upwork, Fiverr, Contra) patch this with escrow and **human dispute resolution**: slow, biased, expensive (~20% take rate), and structurally unable to handle **AI-agent counterparties** because there's no human to call.

Two things became simultaneously true in 2025 and are the reason this protocol can exist now:

1. **Streaming USDC micropayments are practical** on Solana (sub-second finality, ~$0.0001 fees, x402-style signed receipts).
2. **Deterministic spec verification is practical** with Claude's structured-output tool use (a model returns scores in a typed schema, never free text).

Scaffold combines them. Payment becomes a **continuous function of verified progress**, computed by a non-human judge with a locked rubric, settled on-chain.

---

## How it works

```
buyer ─► initialize_escrow ─► deposit ─► release_streamed (× N: idx, score_bps)
                                                  ▲
                                                  │ Claude verifier
                                                  │ scores artifact every TICK_MS
                                                  │ submit_scores tool call → release_streamed
                                                  ▼
                          finalize_job (anyone cranks)
                          ├── total_bps ≥ quality_threshold_bps → vault remainder → worker
                          └── otherwise                          → vault remainder → buyer
```

The whole loop is on-chain plus one off-chain process (the verifier) whose authority is bounded to a single Ed25519 signer. There is no admin, no platform multi-sig, no human escalation path.

### Streaming-style release, not binary

Every checkpoint has a `weight_bps` (basis points, 0–10000) and a running `bps_released_per_cp[i]` (0..=weight). When the verifier posts `release_streamed(idx, score_bps)`:

```
target = min(score_bps, weight)
require!(target > already_released)        // forward-progress only
amount  = budget * (target − already) / 10_000
transfer(vault → worker_ata, amount)
bps_released_per_cp[idx] = target
```

So the verifier can call repeatedly with rising scores. A checkpoint goes from 30% → 60% → 90% → 100% across multiple ticks; each call streams the **delta**. Funds never go backwards.

### Surplus routing on finalize

After the deadline OR all checkpoints are fully scored, **anyone** can crank `finalize_job`. The instruction reads:

```
total_bps = sum(bps_released_per_cp[..checkpoint_count])
if total_bps ≥ quality_threshold_bps:
    vault.remainder → worker_ata          // quality bonus
else:
    vault.remainder → buyer_ata           // refund
finalized = true
```

Reputation = the worker's lifetime `released` USDC across all of their escrow accounts. Indexed via `getProgramAccounts`, sortable by anyone.

---

## Architecture

| Layer        | Tech                                  | Lives in                           |
| ------------ | ------------------------------------- | ---------------------------------- |
| Settlement   | Anchor 0.31 program on Solana         | `programs/scaffold_escrow/src/lib.rs` |
| Front-end    | Vite 8 + React 19 + Wallet Adapter    | `src/`                             |
| Verifier     | Node + `@anthropic-ai/sdk` (Claude)   | `agents/verifier.ts`               |
| Worker       | Node + `@anthropic-ai/sdk` (Claude)   | `agents/worker.ts`                 |
| Demo runner  | Node + Anchor TS client               | `agents/demo-runner.ts`            |
| Leaderboard  | `program.account.escrow.all()`        | `src/components/Leaderboard.tsx`   |
| CI           | GitHub Actions                        | `.github/workflows/ci.yml`         |

### Trust boundaries

- **Buyer** signs `initialize_escrow`, `deposit`, and `refund_buyer`. They lock USDC into a PDA.
- **Arbiter** signs `release_streamed` and `set_pause`. This is the only authority that can move funds toward the worker mid-job. The arbiter's keypair is held by the verifier process.
- **Worker** never signs anything on the protocol — they receive USDC into an associated token account.
- **Cranker** (anyone) signs `finalize_job`. The outcome is determined entirely by on-chain state, so a crank by a bot or by the worker themselves is identical.

The buyer trusts the arbiter pubkey they pick at `initialize_escrow`. The buyer cannot retroactively replace it.

---

## On-chain instructions

| Instruction         | Signer    | Effect                                                                                  | Failure modes                          |
| ------------------- | --------- | --------------------------------------------------------------------------------------- | -------------------------------------- |
| `initialize_escrow` | buyer     | Create PDA + vault, lock spec params (weights, deadline, threshold, hash)               | weights ≠ 10_000, threshold > 10_000   |
| `deposit`           | buyer     | Transfer `budget` USDC into the escrow vault                                            | already deposited                      |
| `release_streamed`  | arbiter   | Score-scaled release for one checkpoint: `(target − already) × budget / 10_000`         | not funded, paused, finalized, no forward progress |
| `set_pause`         | arbiter   | Halt new releases (used to stop streaming when verifier rejects an artifact)            | not arbiter                            |
| `refund_buyer`      | buyer     | Vault → buyer ATA. Allowed when **paused** OR **past deadline**                         | active and pre-deadline                |
| `finalize_job`      | anyone    | After deadline OR fully scored: surplus → worker (`≥ threshold`) or buyer (`< threshold`) | pre-deadline and not fully scored      |

All errors return rich `EscrowError` variants with `#[msg]` strings (`programs/scaffold_escrow/src/lib.rs`).

---

## Account layout

```rust
#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub buyer: Pubkey,                          // 32
    pub worker: Pubkey,                         // 32
    pub arbiter: Pubkey,                        // 32
    pub mint: Pubkey,                           // 32
    pub bump: u8,                               // 1
    pub nonce: u64,                             // 8
    pub budget: u64,                            // 8
    pub released: u64,                          // 8   lifetime released to worker
    pub checkpoint_count: u8,                   // 1
    pub weights: [u16; MAX_CHECKPOINTS],        // 32  bps, must sum to 10_000
    pub bps_released_per_cp: [u16; MAX_CHECKPOINTS], // 32  per-cp progress
    pub deposited: bool,                        // 1
    pub paused: bool,                           // 1
    pub finalized: bool,                        // 1
    pub deadline_unix: i64,                     // 8
    pub quality_threshold_bps: u16,             // 2
    pub spec_hash: [u8; 32],                    // 32  SHA-256(spec JSON)
}
```

PDA seeds: `[b"escrow", buyer.key().as_ref(), &nonce.to_le_bytes()]`. One escrow per `(buyer, nonce)` pair so a buyer can run many concurrent jobs.

`MAX_CHECKPOINTS = 16`. Practical demos use 8–10.

---

## Repo layout

```
sonsensus/
├── programs/scaffold_escrow/        # Anchor program
│   ├── src/lib.rs                   # all on-chain logic (~310 LOC)
│   └── scaffold_escrow-keypair.json # program id keypair (committed by design)
├── src/                             # Vite + React dashboard
│   ├── App.tsx                      # hero, derives state from chain when escrow connected
│   ├── chain/
│   │   ├── config.ts                # cluster + program id + USDC mint
│   │   ├── escrowPda.ts             # PDA derivation
│   │   ├── program.ts               # typed Program<ScaffoldEscrow>
│   │   └── leaderboard.ts           # getProgramAccounts → ranking
│   ├── components/
│   │   ├── OnChainEscrow.tsx        # full operator UI (init/deposit/score/finalize)
│   │   └── Leaderboard.tsx          # worker reputation panel
│   ├── domain/scaffold.ts           # demo contract + integrity engine + tests
│   ├── idl/                         # vendored IDL JSON + generated TS types
│   └── wallet/AppProviders.tsx      # Phantom + Solflare adapters
├── agents/                          # Off-chain Claude processes
│   ├── lib/program.ts               # node-side Anchor client
│   ├── spec.example.json            # 9-checkpoint rubric (weights sum to 10_000)
│   ├── worker.ts                    # Claude builds the artifact (FAIL_MODE=1 for Act 2)
│   ├── verifier.ts                  # Claude scores it on TICK_MS, signs release_streamed
│   ├── demo-runner.ts               # Autonomous 3-act on-chain run
│   └── README.md                    # agent-specific notes
├── .github/workflows/ci.yml         # lint + test + build + anchor build + IDL drift check
├── Anchor.toml                      # 0.31.1 toolchain, devnet/testnet/localnet program ids
├── DEPLOY.md                        # devnet deploy walkthrough
├── package.json                     # all npm scripts (anchor:build, agent:*, lint, etc.)
└── tsconfig.json + tsconfig.agents.json  # split front-end vs node TS configs
```

---

## Setup

### Prerequisites

- **Node 20+** (front-end + agents)
- **Solana CLI** (`solana --version` ≥ 2.0)
- **Anchor 0.31.1** (`anchor --version`)
- A Solana keypair with devnet SOL (for program deploy fees)

### Install

```bash
npm install
```

### Build the program (once per source change)

```bash
npm run anchor:build           # SBF compile + write target/idl + target/types
npm run anchor:sync-types      # vendor target/idl + target/types into src/idl
```

CI fails if `target/idl/scaffold_escrow.json` and `src/idl/scaffold_escrow.json` ever drift.

### Deploy to devnet

```bash
solana config set --url https://api.devnet.solana.com
solana airdrop 3                                          # for program rent
anchor deploy --provider.cluster devnet
```

The committed keypair fixes the program id at `4dUWewdZ6q1wXD8YxLJFrhWqqp6Gnk7TrXSD8WqDAMnG`. Don't regenerate it unless you also update `Anchor.toml` and `src/chain/config.ts`.

### Front-end env (`.env.local`)

```env
VITE_SOLANA_CLUSTER=devnet
VITE_SOLANA_RPC=https://api.devnet.solana.com
VITE_PROGRAM_ID=4dUWewdZ6q1wXD8YxLJFrhWqqp6Gnk7TrXSD8WqDAMnG
VITE_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

### Agent env (`.env`)

```env
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-4-7
RPC_URL=https://api.devnet.solana.com
USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
BUYER_KEYPAIR=/abs/path/to/buyer.json
WORKER_KEYPAIR=/abs/path/to/worker.json
ARBITER_KEYPAIR=/abs/path/to/arbiter.json
BUYER_PUBKEY=<base58>
NONCE=1
SPEC=agents/spec.example.json
ARTIFACT=agents/output/index.html
TICK_MS=30000
BUDGET_USDC=25
```

Generate the three keypairs locally:

```bash
solana-keygen new -o ~/.config/solana/buyer.json --no-bip39-passphrase --force
solana-keygen new -o ~/.config/solana/worker.json --no-bip39-passphrase --force
solana-keygen new -o ~/.config/solana/arbiter.json --no-bip39-passphrase --force
```

### Faucets

| What         | Where                                                                 | Notes                          |
| ------------ | --------------------------------------------------------------------- | ------------------------------ |
| Devnet SOL   | `solana airdrop 1 <PUBKEY> --url devnet`, https://faucet.solana.com/ | Rate-limited, retry            |
| Devnet USDC  | https://faucet.circle.com/                                            | Pick **Solana Devnet**         |

Helius and QuickNode both expose free devnet RPC endpoints if `api.devnet.solana.com` is rate-limiting you.

---

## Run the demo

### Live UI

```bash
npm run dev
# open http://localhost:5173
```

1. Connect Phantom or Solflare on **devnet**.
2. Click **Request devnet SOL (1)** in the on-chain card.
3. Get devnet USDC into your wallet ATA via Circle's faucet.
4. Paste the **worker pubkey** and (optionally) **arbiter pubkey**.
5. Click **Initialize escrow** → **Deposit full budget** → **Create worker USDC ATA**.
6. As the arbiter wallet, type a `score_bps` per checkpoint (default = full weight) and click **Release**. Repeat with rising scores to see partial credit accumulate.
7. **Pause / Unpause** mid-stream to demo the failure act.
8. After the deadline OR full scoring, click **Finalize** to route the surplus.

The hero panel pulls everything from the connected escrow via `connection.onAccountChange` — no manual refresh.

### Autonomous on-chain demo (no UI clicks)

```bash
BUYER_KEYPAIR=...   WORKER_KEYPAIR=... \
ARBITER_KEYPAIR=... USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU \
BUDGET_USDC=25      npm run agent:demo
```

In ~30 seconds the script does:

```
init → deposit → release × 4 (Act 1)
              → pause (Act 2)
              → unpause → release remaining at 80% then 100% (Act 3)
              → finalize → surplus to worker (quality ≥ 80%)
```

### Live Claude verifier

In one terminal:

```bash
npm run agent:worker          # writes agents/output/index.html
# or for the failure act:
FAIL_MODE=1 npm run agent:worker
```

In a second terminal:

```bash
npm run agent:verifier
```

The verifier loop:

1. Fetches the escrow account.
2. If finalized → exit. If paused or pre-deposit → sleep.
3. Loads the artifact from `ARTIFACT` (file path or HTTPS URL).
4. Calls Claude with the `submit_scores` tool, schema-locked to `{ checkpoint_id, score_bps, evidence }[]`.
5. For each checkpoint where `target > already_released`, signs `release_streamed(idx, target)`.
6. Sleeps `TICK_MS` (default 30 s).

---

## Front-end behavior

- **Hero** — pulls `released`, `paused`, `finalized`, and per-checkpoint `bps_released` from the connected escrow when a session is active. Falls back to a static demo contract when no escrow is connected so the page still tells the story for cold visitors.
- **OnChainEscrow** — typed `Program<ScaffoldEscrow>`, no `unknown` casts. Switched from polling to `connection.onAccountChange(escrowPk)` + `onAccountChange(vaultAta)` so updates are push-based.
- **Leaderboard** — `program.account.escrow.all()` grouped by `worker`, sorted by lifetime `released`, refreshed every 30 s. Reputation that can't be faked.

---

## Agents

### Worker (`agents/worker.ts`)

Calls `messages.create` with a single tool, `write_artifact`. The tool's input schema is `{ html: string, notes?: string }`. Because `tool_choice = { type: 'tool', name: 'write_artifact' }`, Claude is forced to call it exactly once. The HTML is written to `agents/output/index.html`.

`FAIL_MODE=1` injects a directive to ship a deliberately broken artifact (no meta description, no anchor tags) so the verifier has to fail at least two checkpoints — the failure act of the demo without a human in the loop.

### Verifier (`agents/verifier.ts`)

Calls `messages.create` with the `submit_scores` tool. The tool returns `{ results: { checkpoint_id, score_bps: 0..=10000, evidence }[] }`. The system prompt explicitly instructs the model to score 0 when the rubric is not met and never speculate beyond the artifact. The verifier:

- Forward-progresses only — never decreases a checkpoint's score.
- Skips checkpoints already at their weight ceiling.
- Stops the loop when `escrow.finalized === true`.
- Exits the inner step (continues the loop) on transient errors.

### Demo runner (`agents/demo-runner.ts`)

Pure Anchor TS client (no Claude). Runs the 3-act flow as fast as Solana confirms transactions. Use this for the live pitch — it's deterministic and never blocks on a model call.

---

## Tests + CI

```bash
npm run lint        # tsc front-end + tsc agents (separate tsconfigs)
npm test            # vitest (5 tests in src/domain + src/App)
npm run build       # vite production build
npm run anchor:build
```

`vitest` covers:
- Demo contract weight basis-points conversion (sum to 10_000).
- Settlement math when a checkpoint fails (status `paused`, refundable amount).
- Stream resume after `applyVerifierResult`.
- Integrity rejection of malformed contracts.
- App renders the core hackathon story.

CI (`.github/workflows/ci.yml`) runs lint + tests + build on every push, plus `anchor build` and an IDL drift check (`diff target/idl/scaffold_escrow.json src/idl/scaffold_escrow.json`).

---

## Security model

**Trusted assumptions:**

- The buyer picks a trustworthy arbiter pubkey at init.
- The arbiter's keypair stays in the verifier process (or any other secure environment) and isn't leaked.
- The Solana cluster is honest (standard L1 trust assumption).

**Defended:**

- Per-checkpoint forward-progress: a malicious arbiter can't replay an old release.
- Vault PDA authority means only the program (not the arbiter) can move funds out.
- `finalize_job` outcome is computed entirely from on-chain state, so it's permissionless.
- `refund_buyer` is allowed only when `paused` OR `past deadline`, preventing a buyer from racing the verifier.
- All releases u128-multiply before u128-divide and trap on overflow.
- Weight sum is validated to exactly 10_000 bps at init; weights cannot be mutated after.

**Not yet implemented (see roadmap):**

- Ed25519 verifier-receipt program instruction (the on-chain x402). Currently the arbiter is a `Signer<'info>`. The cleaner pattern is `Sysvar<Instructions>` + `ed25519_program` so any cranker can submit a verifier-signed receipt.
- Token-2022 transfer hooks. We use the legacy SPL Token program; mainnet USDC is migrating.
- A program-side challenge / slashing mechanism for misbehaving arbiters.

---

## Roadmap

- [ ] Ed25519 receipt verification (anyone-can-crank with a verifier signature).
- [ ] `litesvm` / `anchor-bankrun` integration test suite for the program.
- [ ] Code-split the wallet adapter UI to drop the front-end bundle below 500 kB.
- [ ] `agents/worker.ts` over a real preview-deploy target (Vercel CLI, Bun.serve, etc.) with HTTP fetch in the verifier.
- [ ] Deterministic verifier types: `lighthouse`, `playwright`, `http`, `link-crawler` — so non-AI checkpoints don't go through Claude at all.
- [ ] Token-2022 support.
- [ ] React Native or Expo wrapper for the dashboard.

---

## License

MIT — see [`LICENSE`](LICENSE) for the full text.

Built for the 72-hour Consensus hackathon. Anchor program is intentionally small and auditable. Issues and PRs welcome.
