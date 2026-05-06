import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { FunctionCallingConfigMode, GoogleGenAI, Type, type FunctionDeclaration } from '@google/genai';

type Spec = {
  title: string;
  buyer: string;
  worker: string;
  checkpoints: Array<{ id: string; title: string; rubric: string }>;
};

const WRITE_FN: FunctionDeclaration = {
  name: 'write_artifact',
  description: 'Persist the final HTML artifact for the verifier to score.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      html: { type: Type.STRING, description: 'Full HTML5 document, doctype through closing html tag.' },
      notes: { type: Type.STRING, description: 'Brief description of intent for the audit trail.' },
    },
    required: ['html'],
  },
};

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY required');
  }
  const specPath = process.env.SPEC ?? 'agents/spec.example.json';
  const outPath = process.env.OUT ?? 'agents/output/index.html';
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-pro';
  const failMode = process.env.FAIL_MODE === '1';

  const spec: Spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const sys =
    'You are the worker agent for the Scaffold protocol. Produce a complete single-file HTML5 landing page that satisfies every rubric in the spec. Return your output by calling write_artifact exactly once.';

  const failureNote = failMode
    ? '\n\nIMPORTANT: ship a deliberately broken artifact for demo Act 2. Omit the meta description and remove all anchor tags so the verifier has to fail at least two checkpoints.'
    : '';

  const user = `Spec:\n${JSON.stringify(spec, null, 2)}${failureNote}`;

  const resp = await gemini.models.generateContent({
    model,
    contents: user,
    config: {
      systemInstruction: sys,
      tools: [{ functionDeclarations: [WRITE_FN] }],
      toolConfig: {
        functionCallingConfig: { mode: FunctionCallingConfigMode.ANY, allowedFunctionNames: [WRITE_FN.name!] },
      },
    },
  });

  const calls = resp.functionCalls ?? [];
  const call = calls.find((c) => c.name === WRITE_FN.name);
  if (!call) {
    throw new Error('Worker did not call write_artifact');
  }
  const { html, notes } = call.args as { html: string; notes?: string };

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
