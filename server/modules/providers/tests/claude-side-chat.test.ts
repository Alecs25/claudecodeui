import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SIDE_CHAT_TOOLS,
  buildSideChatOptions,
  readSideChatEvents,
  startClaudeSideChat,
} from '@/modules/providers/list/claude/claude-side-chat.js';

test('a side chat forks the session without persisting it and only reads', async () => {
  const options = buildSideChatOptions({ providerSessionId: 'abc', cwd: '/tmp/project', model: 'opus' });
  assert.equal(options.resume, 'abc');
  assert.equal(options.forkSession, true);
  assert.equal(options.persistSession, false);
  assert.equal(options.model, 'opus');
  assert.deepEqual(options.tools, [...SIDE_CHAT_TOOLS]);
  assert.ok(!(options.tools as string[]).includes('Edit'));
  assert.ok(!(options.tools as string[]).includes('Bash'));

  const canUseTool = options.canUseTool as (name: string, input: Record<string, unknown>) => Promise<{ behavior: string }>;
  assert.equal((await canUseTool('Write', {})).behavior, 'deny');
  assert.equal((await canUseTool('mcp__x__delete', {})).behavior, 'deny');
  assert.equal((await canUseTool('Read', { file_path: '/a' })).behavior, 'allow');
});

test('SDK messages become text, tool, done and error events', () => {
  assert.deepEqual(readSideChatEvents({
    type: 'assistant',
    message: { content: [
      { type: 'text', text: 'Looking.' },
      { type: 'tool_use', name: 'Read', input: { file_path: '/src/a.ts' } },
    ] },
  }), [
    { event: 'text', text: 'Looking.' },
    { event: 'tool', name: 'Read', detail: '/src/a.ts' },
  ]);
  assert.deepEqual(readSideChatEvents({ type: 'result', subtype: 'success' }), [{ event: 'done' }]);
  assert.equal(readSideChatEvents({ type: 'result', subtype: 'error_during_execution', is_error: true })[0].event, 'error');
  assert.deepEqual(readSideChatEvents({ type: 'system' }), []);
});

test('questions go to one process and closing ends it', async () => {
  const prompts: unknown[] = [];
  let closed = false;
  const events: unknown[] = [];
  let release: () => void = () => {};
  const done = new Promise<void>((resolve) => { release = resolve; });

  const chat = startClaudeSideChat(
    { providerSessionId: 'abc', cwd: '/tmp', onEvent: (event) => events.push(event) },
    {
      createQuery: ({ prompt }) => ({
        async *[Symbol.asyncIterator]() {
          for await (const message of prompt) {
            prompts.push(message);
            yield { type: 'assistant', message: { content: [{ type: 'text', text: `answer ${prompts.length}` }] } };
            yield { type: 'result', subtype: 'success' };
            if (prompts.length === 2) {
              release();
            }
          }
        },
        close: () => { closed = true; },
      }),
    },
  );

  assert.equal(chat.ask('first?'), true);
  assert.equal(chat.ask('second?'), true);
  await done;
  // Lets the consumer loop hand over the last events before checking them.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(prompts.length, 2);
  assert.deepEqual(events, [
    { event: 'text', text: 'answer 1' },
    { event: 'done' },
    { event: 'text', text: 'answer 2' },
    { event: 'done' },
  ]);
  chat.close();
  assert.equal(closed, true);
  assert.equal(chat.ask('third?'), false);
});
