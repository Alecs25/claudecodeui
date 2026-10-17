import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

import { getModuleDirectory } from '@/shared/utils.js';

const __dirname = getModuleDirectory(import.meta.url);

/** Runs the stdio server once over the given requests and returns the responses by id. */
async function callServer(requests: Record<string, unknown>[]): Promise<Map<unknown, any>> {
  const child = spawn(process.execPath, ['--import', 'tsx', path.join(__dirname, 'chapters-mcp.ts')], {
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

test('mark_chapter is listed and accepts a short title', async () => {
  const responses = await callServer([
    { id: 1, method: 'tools/list' },
    { id: 2, method: 'tools/call', params: { name: 'mark_chapter', arguments: { title: 'Auth bug fix', summary: 'Fix the token refresh' } } },
  ]);
  assert.deepEqual(responses.get(1).result.tools.map((tool: { name: string }) => tool.name), ['mark_chapter']);
  const result = responses.get(2).result;
  assert.equal(result.isError, false);
  assert.match(result.content[0].text, /Auth bug fix/);
});

test('mark_chapter refuses an empty or overlong title', async () => {
  const responses = await callServer([
    { id: 1, method: 'tools/call', params: { name: 'mark_chapter', arguments: { title: '  ' } } },
    { id: 2, method: 'tools/call', params: { name: 'mark_chapter', arguments: { title: 'x'.repeat(41) } } },
  ]);
  assert.equal(responses.get(1).result.isError, true);
  assert.equal(responses.get(2).result.isError, true);
});
