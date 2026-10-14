#!/usr/bin/env node
// Stdio MCP server for the send_user_file tool. It holds no state: every call
// is forwarded to the running CloudCLI server, which stores and announces the
// files. Same newline-delimited JSON-RPC transport as the Browser MCP.

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

type SentFileSummary = { id: string; name: string; size: number; mimeType: string };

const apiUrl = (process.env.CLOUDCLI_SENT_FILES_API_URL || 'http://127.0.0.1:3001/api/sent-files-mcp').replace(/\/$/, '');
const apiToken = process.env.CLOUDCLI_SENT_FILES_MCP_TOKEN || '';
const API_TIMEOUT_MS = 60000;

const sendUserFileTool = {
  name: 'send_user_file',
  description: [
    'Send files to the user in CloudCLI. Use it for anything the user would want to see rather than just hear about:',
    'a generated report, an HTML page or artifact, a diagram, a screenshot, a PDF.',
    'Each file appears in the chat as a card and the first one opens in the side panel,',
    'where HTML is rendered (sandboxed), images/PDFs are previewed and text is shown read-only.',
    'Pass absolute paths of files that already exist. Set notify=true when the user is likely away',
    '(long task finished, deliverable ready) to also send a push notification to their devices.',
    'Do not send scratch files or every intermediate save.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        description: 'Absolute paths of the files to send.',
      },
      caption: { type: 'string', description: 'Optional one-line context shown on the card.' },
      notify: { type: 'boolean', description: 'Also send a push notification. Default false.' },
    },
    required: ['files'],
  },
};

const textResult = (text: string, isError = false) => ({ content: [{ type: 'text', text }], isError });

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function sendUserFile(args: Record<string, unknown>) {
  if (!apiToken) {
    return textResult('CLOUDCLI_SENT_FILES_MCP_TOKEN is not configured.', true);
  }
  const response = await fetch(`${apiUrl}/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: args.files, caption: args.caption, notify: args.notify === true }),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  const data = await response.json() as { success?: boolean; data?: { files: SentFileSummary[] }; error?: string };
  if (!response.ok || data.success === false || !data.data) {
    return textResult(data.error || `Send failed (${response.status}). Is the CloudCLI server running?`, true);
  }
  const lines = data.data.files.map((file) => `- ${file.name} (${formatSize(file.size)}) id=${file.id}`);
  // The JSON block is what the chat card parses; the text line is for the model.
  return {
    content: [
      { type: 'text', text: `Sent ${data.data.files.length} file(s) to the user:\n${lines.join('\n')}` },
      { type: 'text', text: JSON.stringify({ sentFiles: data.data.files }) },
    ],
  };
}

async function handleMessage(message: JsonRpcRequest) {
  if (message.method === 'initialize') {
    return {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'cloudcli-send-file', version: '1.0.0' },
    };
  }
  if (message.method === 'tools/list') {
    return { tools: [sendUserFileTool] };
  }
  if (message.method === 'tools/call') {
    const params = message.params || {};
    if (params.name !== sendUserFileTool.name) {
      throw new Error(`Unknown tool: ${String(params.name)}`);
    }
    const args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Record<string, unknown>;
    try {
      return await sendUserFile(args);
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), true);
    }
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
