import assert from 'node:assert/strict';

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, test, vi } from 'vitest';

import type { SentFileSummary } from '@/shared/types';

/**
 * The central file viewer: sent files and HTML links open over the workspace,
 * HTML pages are laid out at a device width and scaled into the stage, and a
 * question about the file goes to the session without closing the viewer.
 */

const readSentFileContent = vi.fn();
const readFileBlob = vi.fn();

vi.mock('@/shared/api', () => ({
  api: { readSentFileContent, readFileBlob },
}));

vi.mock('@/shared/context/ThemeContext', () => ({
  useTheme: () => ({ isDarkMode: false, toggleDarkMode: () => undefined }),
}));

vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value }: { value: string }) => <pre data-testid="editor">{value}</pre>,
}));

let websocketListener: ((event: Record<string, unknown>) => void) | null = null;
vi.mock('@/shared/context/WebSocketContext', () => ({
  useWebSocket: () => ({
    subscribe: (listener: (event: Record<string, unknown>) => void) => {
      websocketListener = listener;
      return () => {
        websocketListener = null;
      };
    },
  }),
}));

const { default: FileViewer } = await import('@/modules/code-editor/FileViewer');
const { default: SentFilesCard } = await import('@/modules/code-editor/SentFilesCard');
const { useFileViewer } = await import('@/modules/code-editor/hooks/useFileViewer');
const { useSentFilesAutoOpen } = await import('@/modules/code-editor/hooks/useSentFilesAutoOpen');
const viewer = await import('@/modules/code-editor/utils/fileViewer');
const { OPEN_SENT_FILE_EVENT } = await import('@/modules/code-editor/utils/sentFiles');

const PAGE = '<!doctype html><h1>Carrello</h1>';
const htmlFile: SentFileSummary = { id: '3f1c2d4e-0000-4000-8000-000000000001', name: 'mockup.html', size: 65536, mimeType: 'text/html' };
const htmlTarget = { source: 'sent', file: htmlFile } as const;

const textResponse = (text: string) => ({ ok: true, status: 200, text: async () => text, blob: async () => new Blob([text]) });

beforeEach(() => {
  readSentFileContent.mockResolvedValue(textResponse(PAGE));
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

const renderViewer = (props: Partial<Parameters<typeof FileViewer>[0]> = {}) => {
  const handlers = { onClose: vi.fn(), onDock: vi.fn(), onAsk: vi.fn() };
  const view = render(
    <FileViewer target={htmlTarget} sessionLabel="LICENSEPLANET \ Prodotti" isMobile={false} {...handlers} {...props} />,
  );
  return { ...view, ...handlers };
};

const pageFrame = async () => waitFor(() => {
  const frame = document.querySelector<HTMLIFrameElement>('iframe[title="mockup.html"]');
  assert.ok(frame, 'the page iframe is rendered');
  return frame;
});

// ---------------------------------------------------------------- utilities

test('a page keeps its width and is only ever scaled down to the stage', () => {
  assert.deepEqual(viewer.computePageFit(1280, 640, 500), { scale: 0.5, frameHeight: 1000, boxWidth: 640, boxHeight: 500 });
  assert.deepEqual(viewer.computePageFit(390, 800, 500), { scale: 1, frameHeight: 500, boxWidth: 390, boxHeight: 500 });
  // A stage not laid out yet must not divide by zero.
  assert.ok(Number.isFinite(viewer.computePageFit(820, 0, 0).frameHeight));
});

test('the default width is desktop on a laptop and tablet below, and the choice is remembered', () => {
  assert.equal(viewer.defaultPageWidthPreset(1440), 'desktop');
  assert.equal(viewer.defaultPageWidthPreset(900), 'tablet');
  assert.equal(viewer.readPageWidthPreset(1440), 'desktop');
  viewer.storePageWidthPreset('phone');
  assert.equal(viewer.readPageWidthPreset(1440), 'phone');
  window.localStorage.setItem('cloudcli:file-viewer:page-width', 'watch');
  assert.equal(viewer.readPageWidthPreset(900), 'tablet', 'an unknown stored value falls back to the default');
});

test('a question carries the file reference and an empty one sends nothing', () => {
  assert.equal(viewer.buildFileQuestionPrompt('mockup.html', ' make the cart red '), '[file: mockup.html]\nmake the cart red');
  assert.equal(viewer.buildFileQuestionPrompt('mockup.html', '   '), '');
});

test('files map to the right view', () => {
  assert.equal(viewer.getFileViewerKind('a.HTML'), 'html');
  assert.equal(viewer.getFileViewerKind('notes.md'), 'markdown');
  assert.equal(viewer.getFileViewerKind('shot.png'), 'image');
  assert.equal(viewer.getFileViewerKind('report.pdf'), 'pdf');
  assert.equal(viewer.getFileViewerKind('data.json'), 'text');
  assert.equal(viewer.getFileViewerKind('archive.zip'), 'binary');
});

test('auto-open needs the setting, a visible page and a laptop-wide viewport', () => {
  const base = { enabled: true, viewportWidth: 1280, pageVisible: true };
  assert.equal(viewer.shouldAutoOpenSentFiles(base), true);
  assert.equal(viewer.shouldAutoOpenSentFiles({ ...base, enabled: false }), false);
  assert.equal(viewer.shouldAutoOpenSentFiles({ ...base, pageVisible: false }), false);
  assert.equal(viewer.shouldAutoOpenSentFiles({ ...base, viewportWidth: 900 }), false, 'a Fold only gets the card');
});

test('a fresh file opens once, and not after its window has passed', () => {
  viewer.markSentFileFresh('a', 1000);
  assert.equal(viewer.consumeFreshSentFile('a', 2000), true);
  assert.equal(viewer.consumeFreshSentFile('a', 2000), false, 'consumed');
  viewer.markSentFileFresh('b', 1000);
  assert.equal(viewer.consumeFreshSentFile('b', 1000 + 60_000), false, 'a history reload long after');
});

// ---------------------------------------------------------------- viewer

test('the viewer renders the page sandboxed, at the chosen width', async () => {
  renderViewer();
  const frame = await pageFrame();
  const sandbox = frame.getAttribute('sandbox') ?? '';
  assert.ok(sandbox.includes('allow-scripts'));
  assert.ok(!sandbox.includes('allow-same-origin'), 'the page never gets the app origin');
  assert.equal(frame.getAttribute('srcdoc'), PAGE);
  // jsdom's window is 1024 wide: desktop by default.
  assert.equal(frame.style.width, '1280px');

  fireEvent.click(screen.getByRole('radio', { name: /Phone/ }));
  assert.equal((await pageFrame()).style.width, '390px');
  assert.equal(window.localStorage.getItem('cloudcli:file-viewer:page-width'), 'phone');
  assert.ok(screen.getByText('LICENSEPLANET \\ Prodotti · 64.0 KB'));
});

test('Escape and the close button close the viewer', async () => {
  const { onClose } = renderViewer();
  await pageFrame();
  fireEvent.keyDown(document.body, { key: 'Escape' });
  assert.equal(onClose.mock.calls.length, 1);
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  assert.equal(onClose.mock.calls.length, 2);
});

test('focus moves into the dialog and Tab stays inside it', async () => {
  renderViewer();
  await pageFrame();
  const dialog = screen.getByRole('dialog', { name: 'mockup.html' });
  assert.equal(document.activeElement, dialog);
  const buttons = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, iframe'));
  buttons[buttons.length - 1].focus();
  fireEvent.keyDown(dialog, { key: 'Tab' });
  assert.equal(document.activeElement, buttons[0]);
});

test('the code view shows the source read-only', async () => {
  renderViewer();
  await pageFrame();
  fireEvent.click(screen.getByRole('radio', { name: 'Code' }));
  assert.equal(screen.getByTestId('editor').textContent, PAGE);
  assert.equal(screen.queryByRole('radiogroup', { name: 'Page width' }), null, 'widths apply to the page only');
});

test('"side by side" hands the file to the side panel', async () => {
  const { onDock } = renderViewer();
  await pageFrame();
  fireEvent.click(screen.getByRole('button', { name: 'Side by side' }));
  assert.equal(onDock.mock.calls.length, 1);
});

test('asking about the file sends a prefixed prompt and keeps the viewer open', async () => {
  const { onAsk, onClose } = renderViewer();
  await pageFrame();
  const field = screen.getByRole('textbox', { name: 'Ask Claude about this file…' });
  fireEvent.change(field, { target: { value: 'make the cart red' } });
  fireEvent.submit(field.closest('form') as HTMLFormElement);
  assert.deepEqual(onAsk.mock.calls[0], ['[file: mockup.html]\nmake the cart red']);
  assert.ok(screen.getByRole('status'));
  assert.equal((field as HTMLInputElement).value, '');
  assert.equal(onClose.mock.calls.length, 0);
});

test('on a phone the page fills the screen, with a back arrow and no width presets', async () => {
  const { onClose } = renderViewer({ isMobile: true });
  const frame = await pageFrame();
  assert.equal(frame.style.width, '100%');
  assert.equal(screen.queryByRole('radiogroup', { name: 'Page width' }), null);
  assert.equal(screen.queryByRole('button', { name: 'Side by side' }), null);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  assert.equal(onClose.mock.calls.length, 1);
});

// ---------------------------------------------------------------- workspace hook

test('the viewer opens on request, and "side by side" moves a sent file to the panel', () => {
  const openInSidePanel = vi.fn();
  const { result } = renderHook(() => useFileViewer({ projectId: 'p1', openInSidePanel }));
  act(() => viewer.requestFileViewerOpen(htmlTarget));
  assert.deepEqual(result.current.viewerTarget, htmlTarget);

  const sidePanelRequests: unknown[] = [];
  const listener = (event: Event) => sidePanelRequests.push((event as CustomEvent).detail);
  window.addEventListener(OPEN_SENT_FILE_EVENT, listener);
  act(() => result.current.dockViewerFile());
  window.removeEventListener(OPEN_SENT_FILE_EVENT, listener);
  assert.deepEqual(sidePanelRequests, [htmlFile]);
  assert.equal(result.current.viewerTarget, null);
});

test('a chat link to an HTML file opens the viewer, any other link the side panel', () => {
  const openInSidePanel = vi.fn();
  const { result } = renderHook(() => useFileViewer({ projectId: 'p1', openInSidePanel }));
  act(() => result.current.openFileFromLink('docs/ux/mock.html'));
  assert.deepEqual(result.current.viewerTarget, { source: 'project', name: 'mock.html', path: 'docs/ux/mock.html', projectId: 'p1' });
  act(() => result.current.openFileFromLink('src/app.ts', null, 12));
  act(() => result.current.openFileFromLink('docs/ux/mock.html', null, 3));
  assert.deepEqual(openInSidePanel.mock.calls, [['src/app.ts', null, 12], ['docs/ux/mock.html', null, 3]]);
});

// ---------------------------------------------------------------- chat card

test('the card shows a page thumbnail and opens the viewer on tap', async () => {
  const opened: unknown[] = [];
  const listener = (event: Event) => opened.push((event as CustomEvent).detail);
  window.addEventListener(viewer.OPEN_FILE_VIEWER_EVENT, listener);
  const { container } = render(<SentFilesCard files={[htmlFile]} />);
  await waitFor(() => assert.ok(container.querySelector('[data-testid="sent-file-thumbnail"] iframe') || readSentFileContent.mock.calls.length > 0));
  fireEvent.click(screen.getByTestId('sent-file-thumbnail'));
  window.removeEventListener(viewer.OPEN_FILE_VIEWER_EVENT, listener);
  assert.deepEqual(opened, [htmlTarget]);
});

test('a thumbnail that cannot be loaded falls back to the icon', async () => {
  readSentFileContent.mockResolvedValue({ ok: false, status: 404 });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  render(<SentFilesCard files={[htmlFile]} />);
  await waitFor(() => assert.equal(readSentFileContent.mock.calls.length > 0, true));
  await waitFor(() => assert.ok(screen.getByTestId('sent-file-thumbnail-fallback')));
  assert.equal(screen.getByTestId('sent-file-thumbnail').querySelector('iframe'), null);
});

test('files without a picture get no thumbnail', () => {
  render(<SentFilesCard files={[{ ...htmlFile, name: 'notes.md', mimeType: 'text/markdown' }]} />);
  assert.equal(screen.queryByTestId('sent-file-thumbnail'), null);
});

// ---------------------------------------------------------------- auto-open

test('a file sent while its session is on screen opens in the viewer once', () => {
  const opened: unknown[] = [];
  const listener = (event: Event) => opened.push((event as CustomEvent).detail);
  window.addEventListener(viewer.OPEN_FILE_VIEWER_EVENT, listener);
  const innerWidth = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  try {
    renderHook(() => useSentFilesAutoOpen());
    act(() => websocketListener?.({ kind: 'sent_files', files: [htmlFile] }));
    const card = render(<SentFilesCard files={[htmlFile]} />);
    card.rerender(<SentFilesCard files={[htmlFile]} />);
    // The same card in a transcript reloaded later does not open again.
    render(<SentFilesCard files={[htmlFile]} />);
  } finally {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: innerWidth });
    window.removeEventListener(viewer.OPEN_FILE_VIEWER_EVENT, listener);
  }
  assert.deepEqual(opened, [htmlTarget]);
});

test('on a Fold-sized viewport a sent file only shows its card', () => {
  const opened: unknown[] = [];
  const listener = (event: Event) => opened.push((event as CustomEvent).detail);
  window.addEventListener(viewer.OPEN_FILE_VIEWER_EVENT, listener);
  const innerWidth = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
  try {
    renderHook(() => useSentFilesAutoOpen());
    act(() => websocketListener?.({ kind: 'sent_files', files: [{ ...htmlFile, id: '3f1c2d4e-0000-4000-8000-000000000002' }] }));
    render(<SentFilesCard files={[{ ...htmlFile, id: '3f1c2d4e-0000-4000-8000-000000000002' }]} />);
  } finally {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: innerWidth });
    window.removeEventListener(viewer.OPEN_FILE_VIEWER_EVENT, listener);
  }
  assert.deepEqual(opened, []);
});
