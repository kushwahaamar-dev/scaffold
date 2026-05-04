import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex } from 'viem';
import { artifactHash, specHash, submissionMessage, type ScaffoldSpec, type SubmissionAuthorization } from '../src/domain/protocol';
import { MemoryAuditStore } from './lib/audit-store';
import type { ScoreResult } from './lib/verification';
import { processScoreRequest, type ChainGateway } from './verifier-server';

const buyer = privateKeyToAccount(`0x${'11'.repeat(32)}`);
const worker = privateKeyToAccount(`0x${'22'.repeat(32)}`);
const arbiter = privateKeyToAccount(`0x${'33'.repeat(32)}`);
const escrow = '0x0000000000000000000000000000000000000100' as Address;
const token = '0x0000000000000000000000000000000000000200' as Address;
const jobId = `0x${'44'.repeat(32)}` as Hex;

function makeSpec(): ScaffoldSpec {
  return {
    version: 'scaffold-spec-v1', title: 'Integration', chain_id: 84532, escrow,
    buyer: buyer.address, worker: worker.address, arbiter: arbiter.address, token,
    budget: '1000000', deadline: '2000000000', quality_threshold_bps: 8000,
    checkpoints: [{ id: 'copy', title: 'Copy', weight_bps: 10000, rubric: 'Clear copy.', verification: 'opinion' }],
  };
}

function mockChain(spec: ScaffoldSpec, receiptStates: Array<'confirmed' | 'failed' | 'unknown'> = ['confirmed']) {
  let progress = 0;
  let writes = 0;
  const chain: ChainGateway = {
    chainId: spec.chain_id, escrow, arbiter: arbiter.address,
    async readJob() { return {
      buyer: buyer.address, worker: worker.address, arbiter: arbiter.address, token,
      budget: 1000000n, workerPaid: 0n, buyerRefunded: 0n, deadline: 2000000000n,
      qualityThresholdBps: 8000, checkpointCount: 1, deposited: true, paused: false, finalized: false, specHash: specHash(spec),
    }; },
    async readProgress() { return { weight: 10000, progress }; },
    async writeProgress(_job, _index, target) { writes++; progress = target; return `0x${writes.toString(16).padStart(64, '0')}` as Hex; },
    async receipt() { return receiptStates.shift() ?? 'confirmed'; },
  };
  return { chain, writes: () => writes, progress: () => progress };
}

async function signedBody(spec: ScaffoldSpec, artifact: string, id: string, idForJob = jobId) {
  const authorization: SubmissionAuthorization = {
    version: 'scaffold-submission-v1', submission_id: id, job_id: idForJob,
    spec_hash: specHash(spec), artifact_hash: artifactHash(artifact), chain_id: spec.chain_id, escrow,
  };
  const signature = await worker.signMessage({ message: submissionMessage(authorization) });
  return { spec, artifact, authorization, signature };
}

const result = (quality: number): ScoreResult[] => [{
  checkpoint_id: 'copy', quality_bps: quality, weighted_progress_bps: quality,
  evidence: quality ? 'Mock opinion: repaired.' : 'Mock opinion: requirement missing.', evidence_type: 'opinion',
}];

describe('paid verifier integration (mocked model and chain)', () => {
  it('runs failure, repair, confirmed payout, and idempotent retry', async () => {
    const spec = makeSpec();
    const store = new MemoryAuditStore();
    const mock = mockChain(spec);
    const failed = await processScoreRequest(await signedBody(spec, 'broken', 'submission-fail'), {
      store, chain: mock.chain, model: async () => result(0),
    });
    expect(failed.state).toBe('confirmed');
    expect(mock.writes()).toBe(0);

    const repairedBody = await signedBody(spec, 'repaired', 'submission-repaired');
    const repaired = await processScoreRequest(repairedBody, { store, chain: mock.chain, model: async () => result(10000) });
    expect(repaired.state).toBe('confirmed');
    expect(mock.progress()).toBe(10000);
    expect(mock.writes()).toBe(1);

    const duplicate = await processScoreRequest(repairedBody, { store, chain: mock.chain, model: async () => { throw new Error('must not rejudge'); } });
    expect(duplicate.state).toBe('confirmed');
    expect(mock.writes()).toBe(1);
  });

  it('preserves an unknown receipt and reconciles it on retry without a second write', async () => {
    const spec = makeSpec();
    const store = new MemoryAuditStore();
    const mock = mockChain(spec, ['unknown', 'confirmed']);
    const body = await signedBody(spec, 'repaired', 'submission-uncertain');
    const uncertain = await processScoreRequest(body, { store, chain: mock.chain, model: async () => result(10000) });
    expect(uncertain.state).toBe('uncertain');
    const confirmed = await processScoreRequest(body, { store, chain: mock.chain, model: async () => result(10000) });
    expect(confirmed.state).toBe('confirmed');
    expect(mock.writes()).toBe(1);
  });

  it('rejects changed specs, artifacts, and cross-job replay before payout', async () => {
    const spec = makeSpec();
    const store = new MemoryAuditStore();
    const mock = mockChain(spec);
    const body = await signedBody(spec, 'artifact', 'submission-bound');
    await expect(processScoreRequest({ ...body, artifact: 'changed' }, { store, chain: mock.chain, model: async () => result(10000) })).rejects.toThrow(/artifact hash/);
    const changedSpec = structuredClone(spec); changedSpec.checkpoints[0].rubric = 'Changed.';
    await expect(processScoreRequest({ ...body, spec: changedSpec }, { store, chain: mock.chain, model: async () => result(10000) })).rejects.toThrow(/spec hash/);
    const replay = { ...body, authorization: { ...body.authorization, job_id: `0x${'55'.repeat(32)}` as Hex } };
    await expect(processScoreRequest(replay, { store, chain: mock.chain, model: async () => result(10000) })).rejects.toThrow(/submission signer/);
    expect(mock.writes()).toBe(0);
  });
});
