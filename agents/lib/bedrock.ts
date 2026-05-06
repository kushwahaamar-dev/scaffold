import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Tool,
  type Message,
} from '@aws-sdk/client-bedrock-runtime';

export type BedrockModel =
  | 'anthropic.claude-3-5-sonnet-20241022-v2:0'
  | 'anthropic.claude-3-haiku-20240307-v1:0'
  | 'us.amazon.nova-pro-v1:0'
  | 'us.amazon.nova-lite-v1:0'
  | string;

export function bedrockClient() {
  return new BedrockRuntimeClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
  });
}

export function defaultBedrockModel(): string {
  return process.env.BEDROCK_MODEL ?? 'us.amazon.nova-pro-v1:0';
}

/// Force-call a single tool and return the parsed input.
export async function bedrockToolCall<T>(opts: {
  client: BedrockRuntimeClient;
  modelId: string;
  system: string;
  user: string;
  tool: Tool;
}): Promise<T> {
  const { client, modelId, system, user, tool } = opts;
  if (!tool.toolSpec?.name) throw new Error('Bedrock tool missing toolSpec.name');
  const messages: Message[] = [{ role: 'user', content: [{ text: user }] }];
  const resp = await client.send(
    new ConverseCommand({
      modelId,
      system: [{ text: system }],
      messages,
      toolConfig: {
        tools: [tool],
        toolChoice: { tool: { name: tool.toolSpec.name } },
      },
      inferenceConfig: { maxTokens: 16_384, temperature: 0 },
    }),
  );
  const content = resp.output?.message?.content ?? [];
  for (const block of content) {
    if (block.toolUse?.input) {
      return block.toolUse.input as T;
    }
  }
  throw new Error('Bedrock returned no tool_use block — got: ' + JSON.stringify(content).slice(0, 500));
}
