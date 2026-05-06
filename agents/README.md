# Scaffold agents

Two off-chain processes that close the loop between spec → artifact → on-chain payment.

## Files

- `spec.example.json` — machine-readable rubric (9 checkpoints, weights sum to 10000 bps)
- `worker.ts` — Claude generates a single-file HTML landing page that satisfies the spec
- `verifier.ts` — Claude scores the artifact every tick and signs `release_streamed` when scores rise
- `lib/program.ts` — shared Anchor + Solana plumbing

## Env

```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-4-7        # or claude-sonnet-4-6 for cheaper ticks
RPC_URL=https://api.devnet.solana.com
ARBITER_KEYPAIR=/Users/you/.config/solana/arbiter.json
BUYER_PUBKEY=...                       # base58
NONCE=1                                # u64
SPEC=agents/spec.example.json
ARTIFACT=agents/output/index.html      # local path or https URL
TICK_MS=30000
```

## Run

```bash
# 1. Build artifact (Act 1 — clean output)
npm run agent:worker

# Or ship deliberately broken output for the failure act
FAIL_MODE=1 npm run agent:worker

# 2. Start the verifier loop in a second terminal
npm run agent:verifier
```

The verifier never decreases a checkpoint's score. It only forwards-progresses, so partial credit
can accumulate across ticks. When all checkpoints reach their weight ceiling — or the deadline
passes — anyone can crank `finalize_job` to route the surplus by quality threshold.
