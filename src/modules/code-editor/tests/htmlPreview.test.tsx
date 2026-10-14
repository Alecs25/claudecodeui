import assert from 'node:assert/strict';

import { render } from '@testing-library/react';
import { test, vi } from 'vitest';

/**
 * HTML files open rendered inside the editor (sidebar included) instead of as
 * source. The document runs in a sandboxed iframe without `allow-same-origin`,
 * so its scripts can never reach the app's origin, auth token or API.
 */

vi.mock('@uiw/react-codemirror', () => ({
  default: () => <div data-testid="editor" />,
}));

const { default: CodeEditorSurface } = await import('@/modules/code-editor/CodeEditorSurface');

const htmlSource = '<!doctype html><h1>Report</h1>';

const renderSurface = (htmlPreview: boolean, isHtmlPreviewFile: boolean) =>
  render(
    <CodeEditorSurface
      content={htmlSource}
      onChange={() => undefined}
      markdownPreview={false}
      isMarkdownFile={false}
      htmlPreview={htmlPreview}
      isHtmlPreviewFile={isHtmlPreviewFile}
      fileName="report.html"
      isDarkMode={false}
      fontSize={14}
      showLineNumbers
      extensions={[]}
    />,
  );

test('an HTML file in preview mode is rendered in a sandboxed iframe', () => {
  const { container, queryByTestId } = renderSurface(true, true);
  const iframe = container.querySelector('iframe');

  assert.ok(iframe, 'the preview iframe is rendered');
  assert.equal(iframe.getAttribute('srcdoc'), htmlSource);
  assert.equal(iframe.getAttribute('title'), 'report.html');
  assert.equal(queryByTestId('editor'), null);
});

test('the preview iframe never gets the app origin', () => {
  const { container } = renderSurface(true, true);
  const sandbox = container.querySelector('iframe')?.getAttribute('sandbox') ?? '';

  assert.ok(sandbox.includes('allow-scripts'));
  assert.ok(!sandbox.includes('allow-same-origin'));
});

test('switching the preview off shows the source editor', () => {
  const { container, queryByTestId } = renderSurface(false, true);

  assert.equal(container.querySelector('iframe'), null);
  assert.ok(queryByTestId('editor'));
});

test('non-HTML files are never previewed as HTML', () => {
  const { container, queryByTestId } = renderSurface(true, false);

  assert.equal(container.querySelector('iframe'), null);
  assert.ok(queryByTestId('editor'));
});
