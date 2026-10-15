/**
 * Inline widgets: the show_widget MCP tool (cloudcli-visualize) hands the chat
 * an HTML or SVG fragment, rendered in the transcript like the visuals in
 * Claude's apps. The fragment runs in a sandboxed iframe without same-origin
 * access, so it can never read CloudCLI's token, cookies or DOM; it talks to the
 * page only through the postMessage bridge below.
 */

/** Window event the composer listens to: a widget asked to send a prompt. Detail: the prompt text. */
export const WIDGET_SEND_PROMPT_EVENT = 'cloudcli:widget-send-prompt';

/** Marks the bridge messages so the page ignores anything else a widget posts. */
export const WIDGET_MESSAGE_SOURCE = 'cloudcli-widget';

const SHOW_WIDGET_TOOL_SUFFIX = '__show_widget';
const MAX_PROMPT_LENGTH = 4000;

export type WidgetBridgeMessage =
  | { source: typeof WIDGET_MESSAGE_SOURCE; type: 'resize'; height: number }
  | { source: typeof WIDGET_MESSAGE_SOURCE; type: 'send-prompt'; text: string }
  | { source: typeof WIDGET_MESSAGE_SOURCE; type: 'open-link'; url: string };

export const isShowWidgetTool = (toolName: string): boolean => toolName.endsWith(SHOW_WIDGET_TOOL_SUFFIX);

export const requestWidgetPrompt = (text: string): void => {
  const prompt = text.trim().slice(0, MAX_PROMPT_LENGTH);
  if (!prompt) {
    return;
  }
  window.dispatchEvent(new CustomEvent<string>(WIDGET_SEND_PROMPT_EVENT, { detail: prompt }));
};

export const parseWidgetBridgeMessage = (data: unknown): WidgetBridgeMessage | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const message = data as Record<string, unknown>;
  if (message.source !== WIDGET_MESSAGE_SOURCE) {
    return null;
  }
  if (message.type === 'resize' && typeof message.height === 'number' && Number.isFinite(message.height)) {
    return { source: WIDGET_MESSAGE_SOURCE, type: 'resize', height: message.height };
  }
  if (message.type === 'send-prompt' && typeof message.text === 'string') {
    return { source: WIDGET_MESSAGE_SOURCE, type: 'send-prompt', text: message.text };
  }
  if (message.type === 'open-link' && typeof message.url === 'string') {
    return { source: WIDGET_MESSAGE_SOURCE, type: 'open-link', url: message.url };
  }
  return null;
};

/** Only http(s) links leave the widget: a javascript: or data: URL opened by the page would run outside the sandbox. */
export const isSafeWidgetLink = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

/** Reads the widget fragment from the tool input, whichever shape the provider stored it in. */
export const readWidgetInput = (toolInput: unknown): { code: string; title: string } => {
  let input = toolInput;
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch {
      return { code: '', title: '' };
    }
  }
  if (!input || typeof input !== 'object') {
    return { code: '', title: '' };
  }
  const record = input as Record<string, unknown>;
  return {
    code: typeof record.widget_code === 'string' ? record.widget_code : '',
    title: typeof record.title === 'string' ? record.title : '',
  };
};

// The widget can only load from these CDNs (same allowlist the tool's guide
// tells the model about); everything else, network calls included, is blocked.
const WIDGET_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://esm.sh",
  "style-src 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com",
  'font-src https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.gstatic.com data:',
  'img-src data: blob:',
].join('; ');

const TABLER_ICONS_STYLESHEET = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.31.0/dist/tabler-icons.min.css';

// Same token names as the visuals in Claude's apps, so the model's habits carry
// over; the values follow CloudCLI's light and dark themes.
const LIGHT_THEME_TOKENS = `
  --surface-0: #f5f4ef; --surface-1: #f0eee6; --surface-2: #ffffff;
  --text-primary: #1f1e1d; --text-secondary: #5f5e5a; --text-muted: #888780;
  --text-accent: #185fa5; --text-danger: #a32d2d; --text-success: #3b6d11; --text-warning: #854f0b;
  --bg-accent: #e6f1fb; --bg-danger: #fcebeb; --bg-success: #eaf3de; --bg-warning: #faeeda;
  --fill-accent: #378add; --fill-danger: #e24b4a; --fill-success: #639922; --fill-warning: #ef9f27;
  --border: rgba(31, 30, 29, 0.15); --border-strong: rgba(31, 30, 29, 0.3); --border-stronger: rgba(31, 30, 29, 0.4);
  --border-accent: #85b7eb; --border-danger: #f09595; --border-success: #97c459; --border-warning: #fac775;`;

const DARK_THEME_TOKENS = `
  --surface-0: #1a1a19; --surface-1: #222220; --surface-2: #2a2a28;
  --text-primary: #f1efe8; --text-secondary: #b4b2a9; --text-muted: #888780;
  --text-accent: #85b7eb; --text-danger: #f09595; --text-success: #97c459; --text-warning: #fac775;
  --bg-accent: #0c447c; --bg-danger: #791f1f; --bg-success: #27500a; --bg-warning: #633806;
  --fill-accent: #378add; --fill-danger: #e24b4a; --fill-success: #639922; --fill-warning: #ef9f27;
  --border: rgba(241, 239, 232, 0.15); --border-strong: rgba(241, 239, 232, 0.3); --border-stronger: rgba(241, 239, 232, 0.4);
  --border-accent: #185fa5; --border-danger: #a32d2d; --border-success: #3b6d11; --border-warning: #854f0b;`;

const BASE_STYLES = `
  :root {${LIGHT_THEME_TOKENS}
    --radius: 8px; --pad-sm: 6px; --pad-md: 10px; --pad-lg: 16px; --pad-xl: 24px;
    --gap-xs: 4px; --gap-sm: 8px; --gap-md: 12px; --gap-lg: 16px; --gap-xl: 24px;
    --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    --font-mono: ui-monospace, "Cascadia Code", Menlo, Consolas, monospace;
    --font-voice: Georgia, "Times New Roman", serif;
    color-scheme: light;
  }
  :root[data-theme="dark"] {${DARK_THEME_TOKENS} color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: transparent; }
  body { font-family: var(--font-sans); font-size: 16px; line-height: 1.7; color: var(--text-primary); overflow: hidden; }
  h1, h2, h3 { color: var(--text-primary); font-weight: 500; margin: 0 0 0.5em; }
  h1 { font-size: 22px; } h2 { font-size: 18px; } h3 { font-size: 16px; }
  a { color: var(--text-accent); }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
  button { font: inherit; font-size: 14px; color: var(--text-primary); background: transparent; border: 0.5px solid var(--border-strong); border-radius: var(--radius); padding: 6px 12px; cursor: pointer; }
  button:hover { background: var(--surface-1); }
  button:active { transform: scale(0.98); }
  input[type="text"], input[type="number"], input[type="email"], input:not([type]), select, textarea {
    font: inherit; font-size: 14px; color: var(--text-primary); background: var(--surface-2);
    border: 0.5px solid var(--border-strong); border-radius: var(--radius); padding: 6px 10px; min-height: 36px;
  }
  input[type="range"] { accent-color: var(--fill-accent); }
  svg text { fill: var(--text-primary); }`;

// postMessage is the only channel out of the sandbox: height for the frame,
// prompts for the composer, links for a new tab.
const BRIDGE_SCRIPT = `
  (function () {
    var source = '${WIDGET_MESSAGE_SOURCE}';
    var post = function (payload) { payload.source = source; parent.postMessage(payload, '*'); };
    window.sendPrompt = function (text) { post({ type: 'send-prompt', text: String(text || '') }); };
    window.openLink = function (url) { post({ type: 'open-link', url: String(url || '') }); };
    document.addEventListener('click', function (event) {
      var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
      if (!link) return;
      event.preventDefault();
      window.openLink(link.href);
    });
    var lastHeight = 0;
    var reportHeight = function () {
      var height = Math.ceil(document.documentElement.scrollHeight);
      if (height !== lastHeight) { lastHeight = height; post({ type: 'resize', height: height }); }
    };
    new ResizeObserver(reportHeight).observe(document.documentElement);
    window.addEventListener('load', reportHeight);
    reportHeight();
  })();`;

const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** The full iframe document around the model's fragment: CSP, theme tokens, icons and the bridge. */
export const buildWidgetDocument = (widgetCode: string, isDarkTheme: boolean): string => `<!doctype html>
<html data-theme="${isDarkTheme ? 'dark' : 'light'}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(WIDGET_CONTENT_SECURITY_POLICY)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${TABLER_ICONS_STYLESHEET}">
<style>${BASE_STYLES}</style>
<script>${BRIDGE_SCRIPT}</script>
</head>
<body>
${widgetCode}
</body>
</html>`;
