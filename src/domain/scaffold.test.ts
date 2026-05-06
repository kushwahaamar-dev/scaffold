import { describe, expect, it } from 'vitest';
import {
  applyVerifierResult,
  createDemoContract,
  evaluateContract,
  getDemoCheckpointCount,
  getDemoCheckpointWeightsBasisPoints,
  verifyContractIntegrity,
} from './scaffold';

describe('Scaffold contract engine', () => {
  it('maps demo checkpoints to 10000 basis points for on-chain weights', () => {
    const bps = getDemoCheckpointWeightsBasisPoints();
    expect(bps).toHaveLength(16);
    expect(getDemoCheckpointCount()).toBe(9);
    expect(bps.slice(0, 9).reduce((a, b) => a + b, 0)).toBe(10_000);
    expect(bps.slice(9).every((w) => w === 0)).toBe(true);
  });

  it('keeps a failed checkpoint refundable and pauses payment release', () => {
    const contract = createDemoContract();
    const settlement = evaluateContract(contract);

    expect(settlement.status).toBe('paused');
    expect(settlement.releasedAmount).toBe(575);
    expect(settlement.lockedAmount).toBe(925);
    expect(settlement.refundableAmount).toBe(325);
    expect(settlement.nextAction).toBe('Worker must repair: Performance budget');
  });

  it('resumes the stream after verifier evidence repairs the failed checkpoint', () => {
    const contract = createDemoContract();
    const repaired = applyVerifierResult(contract, {
      checkpointId: 'performance',
      state: 'passed',
      evidence: 'Lighthouse completed at 1.7s on the production preview.',
      verifier: 'deterministic:lighthouse',
    });

    const settlement = evaluateContract(repaired);

    expect(settlement.status).toBe('streaming');
    expect(settlement.releasedAmount).toBe(900);
    expect(settlement.refundableAmount).toBe(0);
    expect(settlement.auditTrail.at(-1)?.summary).toContain('performance passed');
  });

  it('rejects malformed production specs before funds can move', () => {
    const broken = {
      ...createDemoContract(),
      checkpoints: createDemoContract().checkpoints.slice(0, 2),
    };

    expect(verifyContractIntegrity(broken)).toEqual({
      ok: false,
      errors: ['Checkpoint weights must add up to 100. Received 18.'],
    });
  });
});
