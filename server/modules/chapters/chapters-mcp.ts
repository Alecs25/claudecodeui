#!/usr/bin/env node
// Stdio MCP server for transcript chapters (mark_chapter). It holds no state and
// calls no API: the title travels in the tool input, which the transcript keeps,
// and the CloudCLI chat draws it as a divider plus an entry in the chapter list.
// Same newline-delimited JSON-RPC transport as the visualize MCP.

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

// Matches the limits of the Claude desktop app's tool, so prompts written for
// one behave the same in the other.
const MAX_TITLE_LENGTH = 40;
const MAX_SUMMARY_LENGTH = 200;

const markChapterTool = {
  name: 'mark_chapter',
  description: [
    'Mark the start of a new chapter in this session.',
    'Call it when the work shifts to a meaningfully different phase: after exploration, when implementation starts,',
    'when a fix lands and verification starts, or when the user pivots to an unrelated request.',
    'The user sees a divider in the transcript and a table of contents to jump between chapters.',
    'Use it sparingly: a typical session has 3-8 chapters. Do not mark a chapter for the very first message.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: `Short noun phrase, under ${MAX_TITLE_LENGTH} characters, e.g. "Auth bug fix".`,
      },
      summary: {
        type: 'string',
        description: 'Optional one-line summary of what this chapter covers.',
      },
    },
    required: ['title'],
  },
};

const textResult = (text: string, isError = false) => ({ content: [{ type: 'text', text }], isError });

function markChapter(args: Record<string, unknown>) {
  const title = typeof args.title === 'string' ? args.title.trim() : '';
  if (!title) {
    return textResult('title is empty.', true);
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return textResult(`title is too long (${title.length} characters, max ${MAX_TITLE_LENGTH}).`, true);
  }
  const summary = typeof args.summary === 'string' ? args.summary.trim() : '';
  if (summary.length > MAX_SUMMARY_LENGTH) {
    return textResult(`summary is too long (${summary.length} characters, max ${MAX_SUMMARY_LENGTH}).`, true);
  }
  return textResult(`Chapter "${title}" marked.`);
}

async function handleMessage(message: JsonRpcRequest) {
  if (message.method === 'initialize') {
    return {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'cloudcli-chapters', version: '1.0.0' },
    };
  }
  if (message.method === 'tools/list') {
    return { tools: [markChapterTool] };
  }
  if (message.method === 'tools/call') {
    const params = message.params || {};
    const args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Record<string, unknown>;
    if (params.name === markChapterTool.name) {
      return markChapter(args);
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
