import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { Hex } from 'viem';
import type { ScoreResult } from './verification.js';

export type TransactionRecord = {
  checkpoint_id: string;
  target_progress_bps: number;
  status: 'submitted' | 'confirmed' | 'failed' | 'uncertain' | 'skipped';
  hash?: Hex;
  error?: string;
};

export type AuditRecord = {
  submission_id: string;
  job_id: Hex;
  spec_hash: Hex;
  artifact_hash: Hex;
  state: 'evaluating' | 'settling' | 'confirmed' | 'failed' | 'uncertain';
  created_at: string;
  updated_at: string;
  scores?: ScoreResult[];
  transactions: TransactionRecord[];
  error?: string;
};

export interface AuditStore {
  get(submissionId: string): Promise<AuditRecord | null>;
  claim(record: AuditRecord): Promise<{ created: boolean; record: AuditRecord }>;
  put(record: AuditRecord): Promise<void>;
}

export class MemoryAuditStore implements AuditStore {
  private records = new Map<string, AuditRecord>();
  async get(id: string) { return structuredClone(this.records.get(id) ?? null); }
  async claim(record: AuditRecord) {
    const existing = this.records.get(record.submission_id);
    if (existing) return { created: false, record: structuredClone(existing) };
    this.records.set(record.submission_id, structuredClone(record));
    return { created: true, record };
  }
  async put(record: AuditRecord) { this.records.set(record.submission_id, structuredClone(record)); }
}

export class FileAuditStore implements AuditStore {
  constructor(private path = process.env.AUDIT_FILE ?? '.scaffold/audit-records.json') {}
  private read(): Record<string, AuditRecord> {
    try { return JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, AuditRecord>; } catch { return {}; }
  }
  private write(records: Record<string, AuditRecord>) {
    mkdirSync(dirname(this.path), { recursive: true });
    const next = `${this.path}.tmp`;
    writeFileSync(next, JSON.stringify(records, null, 2));
    renameSync(next, this.path);
  }
  async get(id: string) { return structuredClone(this.read()[id] ?? null); }
  async claim(record: AuditRecord) {
    const records = this.read();
    if (records[record.submission_id]) return { created: false, record: structuredClone(records[record.submission_id]) };
    records[record.submission_id] = record;
    this.write(records);
    return { created: true, record };
  }
  async put(record: AuditRecord) {
    const records = this.read();
    records[record.submission_id] = record;
    this.write(records);
  }
}

export class DynamoAuditStore implements AuditStore {
  private doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  constructor(private table: string) {}
  async get(id: string) {
    const result = await this.doc.send(new GetCommand({ TableName: this.table, Key: { submissionId: id }, ConsistentRead: true }));
    return (result.Item?.record as AuditRecord | undefined) ?? null;
  }
  async claim(record: AuditRecord) {
    try {
      await this.doc.send(new PutCommand({
        TableName: this.table,
        Item: { submissionId: record.submission_id, jobId: record.job_id, state: record.state, updatedAt: record.updated_at, record },
        ConditionExpression: 'attribute_not_exists(submissionId)',
      }));
      return { created: true, record };
    } catch (error) {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error;
      const existing = await this.get(record.submission_id);
      if (!existing) throw new Error('audit claim lost');
      return { created: false, record: existing };
    }
  }
  async put(record: AuditRecord) {
    await this.doc.send(new PutCommand({
      TableName: this.table,
      Item: { submissionId: record.submission_id, jobId: record.job_id, state: record.state, updatedAt: record.updated_at, record },
    }));
  }
}

export function defaultAuditStore(): AuditStore {
  return process.env.SCORES_TABLE ? new DynamoAuditStore(process.env.SCORES_TABLE) : new FileAuditStore();
}
