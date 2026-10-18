#!/usr/bin/env node
// Stdio MCP server for new-session suggestions (suggest_session), the "task
// chips" of the Claude desktop app. It holds no state and calls no API: the
// suggestion travels in the tool input, which the transcript keeps, and the
// CloudCLI chat draws it as a card whose button starts the new session.
// Same newline-delimited JSON-RPC transport as the chapters MCP.

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

const MAX_TITLE_LENGTH = 60;
const MAX_SUMMARY_LENGTH = 300;
const MAX_PROMPT_LENGTH = 8000;

const suggestSessionTool = {
  name: 'suggest_session',
  description: [
    'Flag out-of-scope work for a separate session instead of doing it now.',
    'Call it when you notice something worth doing that would bloat the current task: dead code, stale docs,',
    'missing tests, a confirmed TODO, a security issue spotted in passing. Do not use it for vague hunches or for',
    'trivial fixes you can make inline. The user sees a card; one tap starts a new session in the same project',
    'with your prompt as its first message, so the prompt must stand alone (file paths, context, goal).',
    'Your current turn continues: keep working on the task at hand.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: `Imperative phrase under ${MAX_TITLE_LENGTH} characters, e.g. "Remove the unused export helper".`,
      },
      summary: {
        type: 'string',
        description: 'One or two plain sentences for the card: why now, and what the new session will do.',
      },
      prompt: {
        type: 'string',
        description: 'Self-contained instructions for the new session, readable without this conversation.',
      },
    },
    required: ['title', 'summary', 'prompt'],
  },
};

const textResult = (text: string, isError = false) => ({ content: [{ type: 'text', text }], isError });

function readText(args: Record<string, unknown>, key: string): string {
  return typeof args[key] === 'string' ? (args[key] as string).trim() : '';
}

function suggestSession(args: Record<string, unknown>) {
  const limits: Array<[string, number]> = [
    ['title', MAX_TITLE_LENGTH],
    ['summary', MAX_SUMMARY_LENGTH],
    ['prompt', MAX_PROMPT_LENGTH],
  ];
  for (const [key, max] of limits) {
    const value = readText(args, key);
    if (!value) {
      return textResult(`${key} is empty.`, true);
    }
    if (value.length > max) {
      return textResult(`${key} is too long (${value.length} characters, max ${max}).`, true);
    }
  }
  return textResult(`Suggestion "${readText(args, 'title')}" shown to the user. Continue with the current task.`);
}

async function handleMessage(message: JsonRpcRequest) {
  if (message.method === 'initialize') {
    return {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'cloudcli-tasks', version: '1.0.0' },
    };
  }
  if (message.method === 'tools/list') {
    return { tools: [suggestSessionTool] };
  }
  if (message.method === 'tools/call') {
    const params = message.params || {};
    const args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Record<string, unknown>;
    if (params.name === suggestSessionTool.name) {
      return suggestSession(args);
    }
    throw new Error(`Unknown tool: ${String(params.name)}`);
  }
  if (message.method.startsWith('notifications/')) {
    return undefined;
  }
  throw new Error(`Unsupported method: ${message.method}`);
}

function writeMessage(message: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

let buffer = '';

process.stdin.on('data', (chunk) => {
  buffer += chunk.toString('utf8');
  let newlineIndex: number;
  while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
    const rawMessage = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (!rawMessage) {
      continue;
    }
    void (async () => {
      let request: JsonRpcRequest;
      try {
        request = JSON.parse(rawMessage) as JsonRpcRequest;
      } catch (error) {
        writeMessage({ jsonrpc: '2.0', id: null, error: { code: -32700, message: String(error) } });
        return;
      }
      try {
        const result = await handleMessage(request);
        if (request.id !== undefined) {
          writeMessage({ jsonrpc: '2.0', id: request.id, result });
        }
      } catch (error) {
        if (request.id !== undefined) {
          writeMessage({
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
          });
        }
      }
    })();
  }
});
