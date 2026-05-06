import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

type Spec = {
  title: string;
  buyer: string;
  worker: string;
  checkpoints: Array<{ id: string; title: string; rubric: string }>;
};

const WRITE_TOOL: Anthropic.Tool = {
  name: 'write_artifact',
  description: 'Persist the final HTML artifact for the verifier to score.',
  input_schema: {
    type: 'object',
    properties: {
      html: { type: 'string', description: 'Full HTML5 document, doctype through closing html tag.' },
      notes: { type: 'string', description: 'Brief description of intent for the audit trail.' },
    },
    required: ['html'],
  },
};

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY required');
  }
  const specPath = process.env.SPEC ?? 'agents/spec.example.json';
  const outPath = process.env.OUT ?? 'agents/output/index.html';
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-7';
  const failMode = process.env.FAIL_MODE === '1';

  const spec: Spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const claude = new Anthropic();

  const sys =
    'You are the worker agent for the Scaffold protocol. Produce a complete single-file HTML5 landing page that satisfies every rubric in the spec. Return your output by calling write_artifact exactly once.';

  const failureNote = failMode
    ? '\n\nIMPORTANT: ship a deliberately broken artifact for demo Act 2. Omit the meta description and remove all anchor tags so the verifier has to fail at least two checkpoints.'
    : '';

  const user = `Spec:\n${JSON.stringify(spec, null, 2)}${failureNote}`;

  const resp = await claude.messages.create({
    model,
    max_tokens: 16_384,
    tools: [WRITE_TOOL],
    tool_choice: { type: 'tool', name: WRITE_TOOL.name },
    system: sys,
    messages: [{ role: 'user', content: user }],
  });

  const toolUse = resp.content.find((c) => c.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Worker did not call write_artifact');
  }
  const { html, notes } = toolUse.input as { html: string; notes?: string };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, 'utf8');
  console.log(`[worker] wrote ${outPath} (${html.length} bytes)`);
  if (notes) {
    console.log(`[worker] notes: ${notes}`);
  }
}

main().catch((e) => {
  console.error('[worker] fatal:', e);
  process.exit(1);
});
