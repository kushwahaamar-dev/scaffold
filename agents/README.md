# Scaffold verifier and worker

The active agent path targets Base and Solidity. `legacy/solana/` is archived and is not used by these commands.

## Protocol

Jobs commit the keccak256 hash of canonical `scaffold-spec-v1` JSON. The committed document includes the full rubric, checkpoint order and weights, settlement terms, participant addresses, chain id and escrow address. `agent:demo` writes the exact document it commits to `agents/output/spec.committed.json` by default.

The worker signs a `scaffold-submission-v1` message containing the submission id, job id, spec hash, artifact hash, chain id and escrow address. The verifier checks that signature against the job's worker and compares every committed field and checkpoint weight with contract state before judging or paying.

Normalized `quality_bps` is 0–10000. Settlement progress is `floor(quality_bps * checkpoint.weight_bps / 10000)`. These units are deliberately distinct.

## Trust and recovery

- Objective HTML checks are labeled `measured`; subjective Bedrock results are labeled `opinion`.
- Artifacts must be supplied inline and are capped at 60 KB. Arbitrary URL fetching is disabled.
- Model output must include every requested opinion checkpoint exactly once with an integer score and bounded evidence.
- A stable submission id is evaluated once. Repeated requests reuse stored scores.
- Every transaction is recorded before receipt waiting. Reverted receipts fail, unknown receipts remain uncertain, and retry reconciles the hash and current contract progress before writing again.
- DynamoDB is used when `SCORES_TABLE` is set. Local runs use `.scaffold/audit-records.json`.
- Production or on-chain settlement refuses to start without `X402_PAY_TO`; retry fee behavior is then controlled by the x402 facilitator and the same stable submission id prevents a second evaluation or payout.

## Run locally

Create and fund a job first:

```bash
npm run agent:demo
```

Then point `SPEC` at the generated committed spec, build an artifact and run the paid client:

```bash
SPEC=agents/output/spec.committed.json npm run agent:worker
npm run agent:verifier:server
SPEC=agents/output/spec.committed.json npm run agent:verifier:client
```

Required variables are documented in `.env.example`. Private keys may be literal hex or paths to key files; never commit them.

## Tests

```bash
npm run lint
npm test
npm run build
npm run contracts:test
```

The agent integration suite uses a clearly labeled mocked model and mocked chain to cover failed work, repair, confirmed payout, duplicate retry, uncertain-receipt recovery and altered-spec/artifact/cross-job rejection. Foundry tests cover real contract accounting, terminal refunds and multi-job isolation. A live Bedrock+x402+Base run remains an authorized deployment exercise; historical contract-demo receipts are not that proof.
