import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  buildClaudeToolPermissionEntry,
  orderPermissionRequests,
  summarizePermissionInput,
} from '@/modules/chat/utils/chatPermissions';

test('buildClaudeToolPermissionEntry derives a scoped git command from JSON input', () => {
  assert.equal(
    buildClaudeToolPermissionEntry('Bash', JSON.stringify({ command: 'git status' })),
    'Bash(git status:*)',
  );
});

test('buildClaudeToolPermissionEntry falls back to the tool name for malformed JSON', () => {
  assert.equal(buildClaudeToolPermissionEntry('Bash', '{"command":'), 'Bash');
});

test('buildClaudeToolPermissionEntry accepts an already parsed tool input', () => {
  assert.equal(buildClaudeToolPermissionEntry('Bash', { command: 'npm test' }), 'Bash(npm:*)');
});

test('buildClaudeToolPermissionEntry rejects JSON with no string command', () => {
  assert.equal(buildClaudeToolPermissionEntry('Bash', JSON.stringify({ command: false })), 'Bash');
});

test('summarizePermissionInput names what each tool would act on', () => {
  assert.deepEqual(summarizePermissionInput('Bash', { command: 'rm -rf dist' }), { kind: 'command', value: 'rm -rf dist' });
  assert.deepEqual(summarizePermissionInput('Edit', JSON.stringify({ file_path: '/repo/a.ts', old_string: 'x' })), { kind: 'file', value: '/repo/a.ts' });
  assert.deepEqual(summarizePermissionInput('WebFetch', { url: 'https://example.com' }), { kind: 'url', value: 'https://example.com' });
});

test('summarizePermissionInput has nothing to say for tools without a subject field', () => {
  assert.equal(summarizePermissionInput('mcp__server__tool', { foo: 'bar' }), null);
  assert.equal(summarizePermissionInput('Bash', { command: '   ' }), null);
  assert.equal(summarizePermissionInput('Bash', '{"command":'), null);
});

test('orderPermissionRequests puts the oldest request first', () => {
  const ordered = orderPermissionRequests([
    { requestId: 'b', receivedAt: new Date('2026-01-01T00:00:02Z') },
    { requestId: 'untimed' },
    { requestId: 'a', receivedAt: '2026-01-01T00:00:01Z' },
  ]);
  assert.deepEqual(ordered.map((request) => request.requestId), ['a', 'b', 'untimed']);
});
