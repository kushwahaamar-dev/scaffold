import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { artifactHash, canonicalJson, qualityToWeightedProgress, recoverSubmissionSigner, specHash, submissionMessage, validateSpec, type ScaffoldSpec, type SubmissionAuthorization } from './protocol';

const account = privateKeyToAccount('0x0000000000000000000000000000000000000000000000000000000000000001');
const address = account.address;
const spec: ScaffoldSpec = {
  version: 'scaffold-spec-v1', title: 'Test', chain_id: 84532, escrow: address,
  buyer: address, worker: address, arbiter: address, token: address,
  budget: '1000000', deadline: '2000000000', quality_threshold_bps: 8000,
  checkpoints: [{ id: 'one', title: 'One', weight_bps: 10000, rubric: 'Pass.', verification: 'opinion' }],
};

describe('Scaffold protocol', () => {
  it.each([[0, 1000, 0], [2000, 1000, 200], [10000, 1000, 1000], [3333, 633, 210]])(
    'converts normalized quality %i at weight %i to progress %i',
    (quality, weight, expected) => expect(qualityToWeightedProgress(quality, weight)).toBe(expected),
  );

  it('uses canonical key ordering for committed specs', () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
    expect(specHash(validateSpec(structuredClone(spec)))).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('rejects changed rubrics and weights through the hash', () => {
    const changed = structuredClone(spec);
    changed.checkpoints[0].rubric = 'Different.';
    expect(specHash(changed)).not.toBe(specHash(spec));
  });

  it('authenticates an artifact and job-bound submission', async () => {
    const auth: SubmissionAuthorization = {
      version: 'scaffold-submission-v1', submission_id: 'submission-1', job_id: `0x${'11'.repeat(32)}`,
      spec_hash: specHash(spec), artifact_hash: artifactHash('hello'), chain_id: spec.chain_id, escrow: spec.escrow,
    };
    const signature = await account.signMessage({ message: submissionMessage(auth) });
    expect(await recoverSubmissionSigner(auth, signature)).toBe(account.address);
  });

  it('rejects duplicate checkpoint ids and non-integer scores', () => {
    const invalid = structuredClone(spec);
    invalid.checkpoints.push({ ...invalid.checkpoints[0] });
    invalid.checkpoints[0].weight_bps = 5000;
    invalid.checkpoints[1].weight_bps = 5000;
    expect(() => validateSpec(invalid)).toThrow(/unique/);
    expect(() => qualityToWeightedProgress(2.5, 1000)).toThrow(/integer/);
  });
});
