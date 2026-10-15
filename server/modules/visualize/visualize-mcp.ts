#!/usr/bin/env node
// Stdio MCP server for inline visuals (show_widget). It holds no state and calls
// no API: the widget code travels in the tool input, which the transcript keeps,
// and the CloudCLI chat renders it in a sandboxed iframe. Same newline-delimited
// JSON-RPC transport as the send-file MCP.

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

const MAX_WIDGET_CODE_LENGTH = 400_000;

const DESIGN_GUIDE = `# Inline widgets in CloudCLI

show_widget draws an HTML or SVG fragment inline in the chat, inside a sandboxed iframe as wide as the message column (about 680-860 px; phones about 360 px). Use it for mockups, cards, dashboards, diagrams, small interactive explainers and calculators. Explanations stay in your reply text; the widget holds only the visual.

## Fragment
- No <!doctype>, <html>, <head> or <body>: the fragment goes inside a page CloudCLI provides.
- Starts with <svg ...> = SVG mode; anything else = HTML.
- HTML order: a short <style> (or inline styles), then the content, then <script> last.
- Begin HTML with <h2 class="sr-only">one-sentence summary</h2>; SVG gets role="img" with <title> and <desc>.
- The frame height follows the content: no position: fixed, no fullscreen, no nested scrolling areas, no tabs or display: none for main content.
- Transparent outer background: the chat provides it.

## Style
- Flat and quiet: no gradients, shadows, blur or glow. Hairline borders: 0.5px solid var(--border). Cards: background var(--surface-2), 12px radius, padding 1rem 1.25rem. Controls: var(--radius) (8px).
- Two weights only: 400 and 500. Headings h1 22px, h2 18px, h3 16px. Body 16px. Nothing below 11px. Sentence case everywhere, no emoji.
- Icons: Tabler outline webfont, already loaded: <i class="ti ti-server" aria-hidden="true"></i>. Never the -filled variants.
- Buttons, inputs, selects and range sliders are pre-styled: write bare tags.
- Round every number you display.

## Colours (work in light and dark mode: never hard-code text colours)
- Surfaces: --surface-0 (page), --surface-1 (muted card), --surface-2 (raised card).
- Text: --text-primary, --text-secondary, --text-muted; roles --text-accent, --text-danger, --text-success, --text-warning.
- Tinted backgrounds: --bg-accent, --bg-danger, --bg-success, --bg-warning (pair each with its --text-* role).
- Solid fills: --fill-accent, --fill-danger, --fill-success, --fill-warning. Borders: --border, --border-strong, --border-{accent,danger,success,warning}.
- Fonts: --font-sans, --font-mono, --font-voice (serif). Spacing: --gap-{xs,sm,md,lg,xl}, --pad-{sm,md,lg,xl}.
- Colour carries meaning (status, category), not decoration: two or three hues at most.

## Behaviour
- sendPrompt(text) sends text to the chat as if the user typed it: use it for follow-ups that need you ("Open the details of X").
- openLink(url) or a plain <a href> opens an http(s) link in a new tab.
- Filtering, sorting and calculations stay in the widget's own JavaScript.
- Validate inputs before acting on them and show the error next to the field.

## Sandbox
- Scripts, styles and fonts load only from cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com, esm.sh, fonts.googleapis.com and fonts.gstatic.com. Load the library <script src> before the inline script that uses it.
- No network calls (fetch, XHR, WebSocket), no external images (use inline SVG or data: URIs), no access to cookies or storage of the page.`;

const readMeTool = {
  name: 'read_me',
  description: 'Returns the design and sandbox rules for show_widget (CSS variables, layout, sendPrompt). Call it once before your first show_widget call in a session.',
  inputSchema: { type: 'object', properties: {} },
};

const showWidgetTool = {
  name: 'show_widget',
  description: [
    'Draw an HTML or SVG fragment inline in the CloudCLI chat: UI mockups, cards, dashboards, diagrams, small interactive explainers.',
    'It renders only in the CloudCLI web UI (sandboxed iframe), not in a terminal.',
    'Call read_me first for the CSS variables and rules.',
    'Write explanations in your reply, not inside the widget.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Short snake_case identifier of this visual, e.g. watchdog_overview_mock.',
      },
      widget_code: {
        type: 'string',
        description: 'The HTML fragment (no doctype/html/head/body) or an <svg> element.',
      },
      loading_messages: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional short messages shown while the widget is written.',
      },
    },
    required: ['title', 'widget_code'],
  },
};

const textResult = (text: string, isError = false) => ({ content: [{ type: 'text', text }], isError });

function showWidget(args: Record<string, unknown>) {
  const code = typeof args.widget_code === 'string' ? args.widget_code.trim() : '';
  if (!code) {
    return textResult('widget_code is empty.', true);
  }
  if (code.length > MAX_WIDGET_CODE_LENGTH) {
    return textResult(`widget_code is too long (${code.length} characters, max ${MAX_WIDGET_CODE_LENGTH}).`, true);
  }
  if (/<\/?(html|head|body)[\s>]/i.test(code) || /<!doctype/i.test(code)) {
    return textResult('Send a fragment: remove <!doctype>, <html>, <head> and <body>.', true);
  }
  return textResult('Widget rendered inline in the chat. Do not repeat its content in your reply.');
}

async function handleMessage(message: JsonRpcRequest) {
  if (message.method === 'initialize') {
    return {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'cloudcli-visualize', version: '1.0.0' },
    };
  }
  if (message.method === 'tools/list') {
    return { tools: [readMeTool, showWidgetTool] };
  }
  if (message.method === 'tools/call') {
    const params = message.params || {};
    const args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Record<string, unknown>;
    if (params.name === readMeTool.name) {
      return textResult(DESIGN_GUIDE);
    }
    if (params.name === showWidgetTool.name) {
      return showWidget(args);
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
