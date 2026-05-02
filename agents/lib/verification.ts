import type { ScaffoldSpec, VerificationKind } from '../../src/domain/protocol.js';
import { qualityToWeightedProgress } from '../../src/domain/protocol.js';

export type RawScore = { checkpoint_id: string; quality_bps: number; evidence: string };
export type ScoreResult = RawScore & {
  weighted_progress_bps: number;
  evidence_type: VerificationKind;
};

export function validateModelScores(value: unknown, expectedIds: string[]): RawScore[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { results?: unknown }).results)) throw new Error('model output must contain results[]');
  const rows = (value as { results: unknown[] }).results;
  if (rows.length !== expectedIds.length) throw new Error('model output is incomplete');
  const seen = new Set<string>();
  const parsed = rows.map((row) => {
    if (!row || typeof row !== 'object') throw new Error('model result must be an object');
    const result = row as RawScore;
    if (!expectedIds.includes(result.checkpoint_id) || seen.has(result.checkpoint_id)) throw new Error('model returned unknown or duplicate checkpoint');
    if (!Number.isInteger(result.quality_bps) || result.quality_bps < 0 || result.quality_bps > 10_000) throw new Error('model quality_bps is invalid');
    if (typeof result.evidence !== 'string' || result.evidence.length < 1 || result.evidence.length > 2_000) throw new Error('model evidence is invalid');
    seen.add(result.checkpoint_id);
    return result;
  });
  if (expectedIds.some((id) => !seen.has(id))) throw new Error('model output is incomplete');
  return parsed;
}

function measuredQuality(id: string, artifact: string): RawScore | null {
  const lower = artifact.toLowerCase();
  const pass = (ok: boolean, evidence: string): RawScore => ({ checkpoint_id: id, quality_bps: ok ? 10_000 : 0, evidence });
  switch (id) {
    case 'spec': return pass(true, 'Verifier validated the committed versioned specification, checkpoint order, and weights.');
    case 'responsive': return pass(/<(header|main|section)\b/i.test(artifact) && /@media|\b(vw|vh|clamp|min|max)\(/i.test(artifact), 'Static HTML check for semantic landmarks and viewport-aware CSS.');
    case 'links': {
      const hrefs = [...artifact.matchAll(/<a\b[^>]*\bhref=["']([^"']*)["']/gi)].map((m) => m[1]);
      return pass(hrefs.length > 0 && hrefs.every((href) => href !== '#' && (/^(https?:|mailto:|#[a-z0-9_-]+)/i.test(href))), 'Parsed anchor href values and rejected empty placeholders.');
    }
    case 'performance': return pass(new TextEncoder().encode(artifact).byteLength < 50_000 && !/@import\b/i.test(artifact), 'Measured artifact bytes and checked CSS imports.');
    case 'deploy': return pass(/^\s*<!doctype html>/i.test(artifact) && /<title>[^<]+<\/title>/i.test(artifact), 'Parsed required doctype and title markers.');
    case 'handoff': return pass(/<meta\s+[^>]*name=["']description["']/i.test(artifact) && /<meta\s+[^>]*property=["']og:title["']/i.test(artifact), 'Parsed description and Open Graph title metadata.');
    case 'audit': return pass(!/\son[a-z]+\s*=|\beval\s*\(/i.test(lower), 'Scanned for inline event handlers and eval calls.');
    default: return null;
  }
}

export async function evaluateArtifact(
  spec: ScaffoldSpec,
  artifact: string,
  runModel: (checkpoints: ScaffoldSpec['checkpoints']) => Promise<unknown>,
): Promise<ScoreResult[]> {
  const measured = new Map<string, RawScore>();
  const opinion = [];
  for (const checkpoint of spec.checkpoints) {
    if (checkpoint.verification === 'measured') {
      const result = measuredQuality(checkpoint.id, artifact);
      if (!result) throw new Error(`no deterministic check implemented for measured checkpoint ${checkpoint.id}`);
      measured.set(checkpoint.id, result);
    } else {
      opinion.push(checkpoint);
    }
  }
  const modelRows = opinion.length === 0 ? [] : validateModelScores(await runModel(opinion), opinion.map((c) => c.id));
  const model = new Map(modelRows.map((row) => [row.checkpoint_id, row]));
  return spec.checkpoints.map((checkpoint) => {
    const raw = checkpoint.verification === 'measured' ? measured.get(checkpoint.id)! : model.get(checkpoint.id)!;
    return {
      ...raw,
      weighted_progress_bps: qualityToWeightedProgress(raw.quality_bps, checkpoint.weight_bps),
      evidence_type: checkpoint.verification,
    };
  });
}
