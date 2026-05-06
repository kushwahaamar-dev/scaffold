import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Tool } from '@aws-sdk/client-bedrock-runtime';

import { bedrockClient, bedrockToolCall, defaultBedrockModel } from './lib/bedrock.js';

type Spec = {
  title: string;
  buyer: string;
  worker: string;
  checkpoints: Array<{ id: string; title: string; rubric: string }>;
};

const WRITE_TOOL: Tool = {
  toolSpec: {
    name: 'write_artifact',
    description: 'Persist the final HTML artifact for the verifier to score.',
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          html: { type: 'string', description: 'Full HTML5 document, doctype through closing html tag.' },
          notes: { type: 'string', description: 'Brief description of intent for the audit trail.' },
        },
        required: ['html'],
      },
    },
  },
};

async function main() {
  const specPath = process.env.SPEC ?? 'agents/spec.example.json';
  const outPath = process.env.OUT ?? 'agents/output/index.html';
  const failMode = process.env.FAIL_MODE === '1';

  const spec: Spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const client = bedrockClient();
  const modelId = defaultBedrockModel();

  const sys =
    'You are the worker agent for the Scaffold protocol. Produce a complete single-file HTML5 landing page that satisfies every rubric in the spec. Return your output by calling write_artifact exactly once.';

  const failureNote = failMode
    ? '\n\nIMPORTANT: ship a deliberately broken artifact for demo Act 2. Omit the meta description and remove all anchor tags so the verifier has to fail at least two checkpoints.'
    : '';

  const user = `Spec:\n${JSON.stringify(spec, null, 2)}${failureNote}`;

  const { html, notes } = await bedrockToolCall<{ html: string; notes?: string }>({
    client, modelId, system: sys, user, tool: WRITE_TOOL,
  });

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, 'utf8');
  console.log(`[worker] wrote ${outPath} (${html.length} bytes) via ${modelId}`);
  if (notes) console.log(`[worker] notes: ${notes}`);
}

main().catch((e) => {
  console.error('[worker] fatal:', e);
  process.exit(1);
});
