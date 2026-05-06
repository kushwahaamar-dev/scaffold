export type CheckpointState = 'pending' | 'running' | 'passed' | 'failed';
export type SettlementStatus = 'streaming' | 'paused';

export interface ScaffoldCheckpoint {
  id: string;
  title: string;
  weight: number;
  state: CheckpointState;
  evidence: string;
  verifier: string;
}

export interface ScaffoldContract {
  id: string;
  client: string;
  worker: string;
  title: string;
  budget: number;
  streamCap: number;
  currency: 'USDC';
  network: 'solana-devnet';
  checkpoints: ScaffoldCheckpoint[];
  auditTrail: ScaffoldAuditEvent[];
}

export interface ScaffoldAuditEvent {
  at: string;
  summary: string;
}

export interface VerifierResult {
  checkpointId: string;
  state: Exclude<CheckpointState, 'pending' | 'running'>;
  evidence: string;
  verifier: string;
}

export interface ContractIntegrity {
  ok: boolean;
  errors: string[];
}

export interface ScaffoldSettlement {
  status: SettlementStatus;
  releasedAmount: number;
  lockedAmount: number;
  refundableAmount: number;
  verifiedWeight: number;
  failedCheckpoints: string[];
  nextAction: string;
  auditTrail: ScaffoldAuditEvent[];
}

const DEMO_CHECKPOINTS: ScaffoldCheckpoint[] = [
  {
    id: 'spec',
    title: 'Structured spec locked',
    weight: 10,
    state: 'passed',
    evidence: 'Eight machine-readable requirements signed by buyer and worker.',
    verifier: 'schema:v1',
  },
  {
    id: 'copy',
    title: 'Hero copy matches rubric',
    weight: 8,
    state: 'passed',
    evidence: 'Contains required headline, proof points, and judge-facing one-liner.',
    verifier: 'claude:structured-rubric',
  },
  {
    id: 'responsive',
    title: 'Responsive layout',
    weight: 8,
    state: 'passed',
    evidence: 'Viewport checks passed at 390px, 768px, and 1440px.',
    verifier: 'playwright:viewport',
  },
  {
    id: 'links',
    title: 'No broken links',
    weight: 6,
    state: 'passed',
    evidence: 'Crawler verified all internal anchors and outbound links.',
    verifier: 'crawler:links',
  },
  {
    id: 'performance',
    title: 'Performance budget',
    weight: 21.6667,
    state: 'failed',
    evidence: 'Largest Contentful Paint measured 2.8s against a 2.0s requirement.',
    verifier: 'deterministic:lighthouse',
  },
  {
    id: 'deploy',
    title: 'Preview deployment',
    weight: 6.3333,
    state: 'passed',
    evidence: 'Preview URL returned HTTP 200 with immutable deployment hash.',
    verifier: 'deployment:http',
  },
  {
    id: 'handoff',
    title: 'Handoff bundle',
    weight: 10,
    state: 'running',
    evidence: 'README and environment notes are being assembled.',
    verifier: 'schema:handoff',
  },
  {
    id: 'audit',
    title: 'Final audit',
    weight: 5,
    state: 'pending',
    evidence: 'Runs after all previous checkpoints pass.',
    verifier: 'qa:final',
  },
  {
    id: 'agent-repair-loop',
    title: 'Agent repair loop',
    weight: 25,
    state: 'pending',
    evidence: 'Unlocks after the failed checkpoint is fixed and re-verified.',
    verifier: 'orchestrator:repair',
  },
];

export function getDemoCheckpointCount(): number {
  return DEMO_CHECKPOINTS.length;
}

/** Basis points (sum 10_000) for on-chain escrow weights — matches demo checkpoint order. */
export function getDemoCheckpointWeightsBasisPoints(): number[] {
  const percents = DEMO_CHECKPOINTS.map((c) => c.weight);
  const bps = percents.map((w) => Math.round((w / 100) * 10_000));
  const sum = bps.reduce((a, b) => a + b, 0);
  const adjusted = [...bps];
  if (sum !== 10_000 && adjusted.length > 0) {
    adjusted[adjusted.length - 1] += 10_000 - sum;
  }
  while (adjusted.length < 16) {
    adjusted.push(0);
  }
  return adjusted.slice(0, 16);
}

export function createDemoContract(): ScaffoldContract {
  return {
    id: 'scaffold-consensus-demo',
    client: 'Aster Labs',
    worker: 'Claude landing-page agent',
    title: 'Consensus launch page',
    budget: 1500,
    streamCap: 900,
    currency: 'USDC',
    network: 'solana-devnet',
    checkpoints: DEMO_CHECKPOINTS.map((checkpoint) => ({ ...checkpoint })),
    auditTrail: [
      {
        at: '2026-05-06T18:30:00.000Z',
        summary: 'Contract funded on Solana devnet escrow boundary.',
      },
    ],
  };
}

export function verifyContractIntegrity(contract: ScaffoldContract): ContractIntegrity {
  const errors: string[] = [];
  const totalWeight = roundMoney(
    contract.checkpoints.reduce((total, checkpoint) => total + checkpoint.weight, 0),
  );

  if (totalWeight !== 100) {
    errors.push(`Checkpoint weights must add up to 100. Received ${totalWeight}.`);
  }

  if (contract.budget <= 0) {
    errors.push('Budget must be greater than zero.');
  }

  if (contract.streamCap <= 0 || contract.streamCap > contract.budget) {
    errors.push('Stream cap must be greater than zero and less than or equal to budget.');
  }

  return { ok: errors.length === 0, errors };
}

export function evaluateContract(contract: ScaffoldContract): ScaffoldSettlement {
  const integrity = verifyContractIntegrity(contract);

  if (!integrity.ok) {
    throw new Error(`Invalid Scaffold contract: ${integrity.errors.join(' ')}`);
  }

  const verifiedWeight = contract.checkpoints.reduce(
    (total, checkpoint) => total + (checkpoint.state === 'passed' ? checkpoint.weight : 0),
    0,
  );
  const failedCheckpoints = contract.checkpoints
    .filter((checkpoint) => checkpoint.state === 'failed')
    .map((checkpoint) => checkpoint.title);
  const failedValue = contract.checkpoints.reduce(
    (total, checkpoint) =>
      total + (checkpoint.state === 'failed' ? (contract.budget * checkpoint.weight) / 100 : 0),
    0,
  );
  const earned = roundMoney((contract.budget * verifiedWeight) / 100);
  const releasedAmount = Math.min(earned, contract.streamCap);
  const firstFailure = failedCheckpoints[0];

  return {
    status: firstFailure ? 'paused' : 'streaming',
    releasedAmount,
    lockedAmount: contract.budget - releasedAmount,
    refundableAmount: roundMoney(failedValue),
    verifiedWeight: roundMoney(verifiedWeight),
    failedCheckpoints,
    nextAction: firstFailure ? `Worker must repair: ${firstFailure}` : 'Continue streaming against remaining checkpoints',
    auditTrail: contract.auditTrail,
  };
}

export function applyVerifierResult(contract: ScaffoldContract, result: VerifierResult): ScaffoldContract {
  let matchedCheckpoint = false;
  const checkpoints = contract.checkpoints.map((checkpoint) => {
    if (checkpoint.id !== result.checkpointId) {
      return checkpoint;
    }

    matchedCheckpoint = true;
    return {
      ...checkpoint,
      state: result.state,
      evidence: result.evidence,
      verifier: result.verifier,
    };
  });

  if (!matchedCheckpoint) {
    throw new Error(`Unknown checkpoint: ${result.checkpointId}`);
  }

  return {
    ...contract,
    checkpoints,
    auditTrail: [
      ...contract.auditTrail,
      {
        at: new Date(0).toISOString(),
        summary: `${result.checkpointId} ${result.state} by ${result.verifier}`,
      },
    ],
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
