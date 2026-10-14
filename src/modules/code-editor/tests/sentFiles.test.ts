import assert from 'node:assert/strict';

import { test } from 'vitest';

import { isSendUserFileTool, parseSentFilesResult } from '@/modules/code-editor/utils/sentFiles';

/**
 * send_user_file results carry the sent files as a JSON text block after the
 * human-readable line; the chat card is built from that block.
 */

const sentFile = { id: '3f1c2d4e-0000-4000-8000-000000000001', name: 'report.html', size: 2048, mimeType: 'text/html' };
const resultText = `Sent 1 file(s) to the user:\n- report.html (2.0 KB) id=${sentFile.id}`;

test('the tool is recognised whatever MCP prefix it gets', () => {
  assert.ok(isSendUserFileTool('mcp__cloudcli-send-file__send_user_file'));
  assert.ok(!isSendUserFileTool('SendUserFile'));
  assert.ok(!isSendUserFileTool('Write'));
});

test('files are read from a string result', () => {
  const content = `${resultText}\n${JSON.stringify({ sentFiles: [sentFile] })}`;
  assert.deepEqual(parseSentFilesResult({ content }), [sentFile]);
});

test('files are read from a content-block result', () => {
  const content = [
    { type: 'text', text: resultText },
    { type: 'text', text: JSON.stringify({ sentFiles: [sentFile] }) },
  ];
  assert.deepEqual(parseSentFilesResult({ content }), [sentFile]);
});

test('a result without the block or with broken JSON yields no files', () => {
  assert.deepEqual(parseSentFilesResult({ content: resultText }), []);
  assert.deepEqual(parseSentFilesResult({ content: '{"sentFiles": [ {"id": ' }), []);
  assert.deepEqual(parseSentFilesResult(undefined), []);
});

test('files are read from the JSON-encoded block array that history returns', () => {
  const content = JSON.stringify([
    { type: 'text', text: resultText },
    { type: 'text', text: JSON.stringify({ sentFiles: [sentFile] }) },
  ]);
  assert.deepEqual(parseSentFilesResult({ content }), [sentFile]);
});
