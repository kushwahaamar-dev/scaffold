# Scaffold — Kiro spec

This file is the durable spec Kiro reads when extending the project. It captures
the architecture, agent interactions, and the contracts each module owes the
others, so Kiro can scaffold new pieces (additional verifier types, new
agent toolkits, integration tests) without diverging from the design.

## Goal

Ship the **Coinbase × AWS Agentic Hackathon** track:

- x402 paywall in front of an AI verifier API → Base USDC settlement
- AWS Bedrock as the LLM judge (Claude or Nova, configurable per tick)
- Reusable agent toolkit so other teams can clone the pattern
- On-chain reputation as a side-effect of accumulating released USDC

## Trust boundaries

| Actor       | Authority                                                               |
| ----------- | ----------------------------------------------------------------------- |
| Buyer       | `initialize`, `deposit`, `refundBuyer`                                   |
| Worker      | Receives USDC. Pays the verifier per tick via x402.                      |
| Arbiter     | `releaseStreamed`, `setPause`. Held by the Lambda verifier.              |
| Cranker     | Anyone. `finalizeJob` is permissionless; outcome is fully on-chain.      |

## Agent flow (each loop iteration)

```
Worker process
  ├─ produce artifact (Bedrock `write_artifact` tool)
  ├─ POST /score on the verifier API (x402 paywalled)
  │    ├─ x402 facilitator settles USDC payment on Base
  │    ├─ Lambda invokes Bedrock `submit_scores` tool
  │    ├─ For each forward-progress checkpoint:
  │    │    Lambda calls ScaffoldEscrow.releaseStreamed(jobId, idx, score_bps)
  │    └─ returns { results, settlement_txs }
  └─ sleep TICK_MS, repeat
```

## Files Kiro should not regress

- `contracts/src/ScaffoldEscrow.sol` — score-scaled streaming, deadline + threshold finalize. Foundry tests are the source of truth.
- `agents/verifier-server.ts` — x402-express paywall + Bedrock scoring + on-chain settlement.
- `agents/lib/bedrock.ts` — single-tool forced-call helper (`bedrockToolCall`).
- `agents/lib/chain.ts` — viem clients + `jobIdFor` keccak match the Solidity `jobIdFor`.
- `infra/lib/scaffold-stack.ts` — Lambda + API Gateway + CloudFront + DynamoDB.

## Extension points (Kiro tasks)

1. **More verifier types.** Add deterministic checkpoints (`lighthouse`, `playwright`, `link-crawler`). Pattern: an `assert(spec, artifact) → ScoreResult` function colocated under `agents/verifiers/<type>.ts`. The server picks based on `spec.checkpoints[i].verifier_type`.
2. **Worker pricing strategy.** `agents/verifier-client.ts` reads `/pricing` before paying. Extend it so the worker chooses between premium (Nova Pro) and economy (Nova Lite) based on quality threshold proximity.
3. **DynamoDB audit log.** Persist every `submit_scores` call into `scaffold-scores` so the leaderboard panel can display per-tick history.
4. **Multi-chain.** Mirror the Anchor program in `legacy/solana/` to expose Scaffold over both Base and Solana with a single agent toolkit.

## Demo script (3 minutes)

1. **Hero** — open `localhost:5173`. Show the live USDC ledger and the BASE SEPOLIA · X402 chip. Say the headline: *Stripe for verified work. AWS judge, Base settlement, x402 paywall.*
2. **Connect** — RainbowKit → MetaMask → Base Sepolia.
3. **Initialize + deposit** — fill in worker address, click *Initialize*, *Approve + Deposit*. Show the explorer link.
4. **Run the verifier** — `npm run agent:worker` in one pane, `npm run agent:verifier:server` + `npm run agent:verifier:client` in two more. Watch ticks score the artifact, x402 settle the verification fee, and `releaseStreamed` events arrive on Base.
5. **Failure act** — re-run worker with `FAIL_MODE=1`. Verifier rejects, scores stay low, payment stops.
6. **Finalize** — anyone clicks *Finalize* in the dashboard; surplus routes by quality threshold.

## Kiro usage in this project

- `kiro build agents/verifier-server.ts` was used to scaffold the x402 + Bedrock handler from the spec at the top of this file.
- `kiro test` was used to drive the Foundry test suite (`contracts/test/ScaffoldEscrow.t.sol`).
- `kiro deploy` was used to render and apply the CDK stack against `us-east-1`.
- During the demo, run `kiro brief` against this file to walk the judge through the architecture.
