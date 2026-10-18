import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

import { getModuleDirectory } from '@/shared/utils.js';

const __dirname = getModuleDirectory(import.meta.url);

/** Runs the stdio server once over the given requests and returns the responses by id. */
async function callServer(requests: Record<string, unknown>[]): Promise<Map<unknown, any>> {
  const child = spawn(process.execPath, ['--import', 'tsx', path.join(__dirname, 'session-suggestions-mcp.ts')], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const responses = new Map<unknown, any>();
  let buffer = '';
  const expected = requests.filter((request) => request.id !== undefined).length;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('MCP server did not answer in time')), 15000);
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) continue;
        const message = JSON.parse(line);
        responses.set(message.id, message);
        if (responses.size === expected) {
          clearTimeout(timer);
          resolve();
        }
      }
    });
    child.on('error', reject);
    for (const request of requests) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...request })}\n`);
    }
  });
  child.kill();
  return responses;
}
const validSuggestion = {
  title: 'Remove the unused export helper',
  summary: 'Spotted while fixing the parser: the helper has no callers left.',
  prompt: 'In src/utils/export.ts, remove exportHelper and its tests; check nothing imports it.',
};

test('suggest_session is listed and accepts a complete suggestion', async () => {
  const responses = await callServer([
    { id: 1, method: 'initialize' },
    { id: 2, method: 'tools/list' },
    { id: 3, method: 'tools/call', params: { name: 'suggest_session', arguments: validSuggestion } },
  ]);
  assert.equal(responses.get(1).result.serverInfo.name, 'cloudcli-tasks');
  assert.deepEqual(responses.get(2).result.tools.map((tool: { name: string }) => tool.name), ['suggest_session']);
  const result = responses.get(3).result;
  assert.equal(result.isError, false);
  assert.match(result.content[0].text, /Remove the unused export helper/);
});

test('suggest_session refuses a missing field or an overlong title', async () => {
  const responses = await callServer([
    { id: 1, method: 'tools/call', params: { name: 'suggest_session', arguments: { ...validSuggestion, prompt: ' ' } } },
    { id: 2, method: 'tools/call', params: { name: 'suggest_session', arguments: { ...validSuggestion, title: 'x'.repeat(61) } } },
  ]);
  assert.equal(responses.get(1).result.isError, true);
  assert.match(responses.get(1).result.content[0].text, /prompt is empty/);
  assert.equal(responses.get(2).result.isError, true);
});
