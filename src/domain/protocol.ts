import {
  getAddress,
  isAddress,
  keccak256,
  recoverMessageAddress,
  stringToHex,
  type Address,
  type Hex,
} from 'viem';

export const SPEC_VERSION = 'scaffold-spec-v1' as const;
export const MAX_ARTIFACT_BYTES = 60_000;

export type VerificationKind = 'measured' | 'opinion';

export type ScaffoldSpec = {
  version: typeof SPEC_VERSION;
  title: string;
  chain_id: number;
  escrow: Address;
  buyer: Address;
  worker: Address;
  arbiter: Address;
  token: Address;
  budget: string;
  deadline: string;
  quality_threshold_bps: number;
  checkpoints: Array<{
    id: string;
    title: string;
    weight_bps: number;
    rubric: string;
    verification: VerificationKind;
  }>;
};

export type SubmissionAuthorization = {
  version: 'scaffold-submission-v1';
  submission_id: string;
  job_id: Hex;
  spec_hash: Hex;
  artifact_hash: Hex;
  chain_id: number;
  escrow: Address;
};

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

export function validateSpec(value: unknown): ScaffoldSpec {
  if (!value || typeof value !== 'object') throw new Error('spec must be an object');
  const spec = value as ScaffoldSpec;
  if (spec.version !== SPEC_VERSION) throw new Error(`unsupported spec version: ${String(spec.version)}`);
  if (!spec.title || spec.title.length > 200) throw new Error('invalid spec title');
  if (!Number.isSafeInteger(spec.chain_id) || spec.chain_id <= 0) throw new Error('invalid chain_id');
  for (const key of ['escrow', 'buyer', 'worker', 'arbiter', 'token'] as const) {
    if (!isAddress(spec[key])) throw new Error(`invalid ${key}`);
    spec[key] = getAddress(spec[key]);
  }
  if (!/^\d+$/.test(spec.budget) || BigInt(spec.budget) <= 0n) throw new Error('invalid budget');
  if (!/^\d+$/.test(spec.deadline) || BigInt(spec.deadline) <= 0n) throw new Error('invalid deadline');
  if (!Number.isInteger(spec.quality_threshold_bps) || spec.quality_threshold_bps < 0 || spec.quality_threshold_bps > 10_000) {
    throw new Error('invalid quality_threshold_bps');
  }
  if (!Array.isArray(spec.checkpoints) || spec.checkpoints.length < 1 || spec.checkpoints.length > 16) {
    throw new Error('checkpoint count must be 1..16');
  }
  const ids = new Set<string>();
  let totalWeight = 0;
  for (const checkpoint of spec.checkpoints) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(checkpoint.id) || ids.has(checkpoint.id)) throw new Error('checkpoint ids must be unique slugs');
    ids.add(checkpoint.id);
    if (!checkpoint.title || checkpoint.title.length > 200) throw new Error(`invalid title for ${checkpoint.id}`);
    if (!checkpoint.rubric || checkpoint.rubric.length > 2_000) throw new Error(`invalid rubric for ${checkpoint.id}`);
    if (!Number.isInteger(checkpoint.weight_bps) || checkpoint.weight_bps <= 0 || checkpoint.weight_bps > 10_000) {
      throw new Error(`invalid weight for ${checkpoint.id}`);
    }
    if (checkpoint.verification !== 'measured' && checkpoint.verification !== 'opinion') throw new Error(`invalid verification kind for ${checkpoint.id}`);
    totalWeight += checkpoint.weight_bps;
  }
  if (totalWeight !== 10_000) throw new Error(`checkpoint weights sum to ${totalWeight}, expected 10000`);
  return spec;
}

export function specHash(spec: ScaffoldSpec): Hex {
  return keccak256(stringToHex(canonicalJson(validateSpec(structuredClone(spec)))));
}

export function artifactHash(artifact: string): Hex {
  if (new TextEncoder().encode(artifact).byteLength > MAX_ARTIFACT_BYTES) throw new Error(`artifact exceeds ${MAX_ARTIFACT_BYTES} bytes`);
  return keccak256(stringToHex(artifact));
}

export function submissionMessage(auth: SubmissionAuthorization): string {
  return `Scaffold authorized artifact submission\n${canonicalJson(auth)}`;
}

export async function recoverSubmissionSigner(auth: SubmissionAuthorization, signature: Hex): Promise<Address> {
  return getAddress(await recoverMessageAddress({ message: submissionMessage(auth), signature }));
}

export function qualityToWeightedProgress(qualityBps: number, weightBps: number): number {
  if (!Number.isInteger(qualityBps) || qualityBps < 0 || qualityBps > 10_000) throw new Error('quality_bps must be an integer from 0 to 10000');
  if (!Number.isInteger(weightBps) || weightBps < 0 || weightBps > 10_000) throw new Error('weight_bps must be an integer from 0 to 10000');
  return Math.floor((qualityBps * weightBps) / 10_000);
}
