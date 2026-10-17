import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ClaudeSessionsProvider } from '@/modules/providers/list/claude/claude-sessions.provider.js';
import { CLAUDE_PREDEFINED_MODELS } from '@/modules/providers/list/claude/claude-models.provider.js';
import {
  hasActiveHeldTurn,
  queryClaudeSDK,
  steerClaudeSDKSession,
} from '@/modules/providers/list/claude/claude-runtime.provider.js';
import type { NormalizedMessage, ProviderRuntimeContext } from '@/shared/types.js';

/**
 * A steering message joins the turn in progress through the held prompt
 * stream. These drive `queryClaudeSDK` with a scripted SDK stream (the seam is
 * `context.createQuery`) and read what the CLI would have read on stdin.
 */

const SESSION_ID = 'app-steer-session';
const NATIVE_ID = 'native-steer-session';

type Scripted = {
  emit: (message: Record<string, unknown>) => void;
  end: () => void;
  released: () => boolean;
  /** Every message the CLI read from its stdin, in order. */
  stdin: Array<Record<string, any>>;
};

function createScriptedQuery(): { createQuery: NonNullable<ProviderRuntimeContext['createQuery']>; script: Scripted } {
  const queue: Array<Record<string, unknown> | null> = [];
  let wake: (() => void) | null = null;
  let released = false;
  const stdin: Array<Record<string, any>> = [];

  const script: Scripted = {
    emit: (message) => { queue.push(message); wake?.(); },
    end: () => { queue.push(null); wake?.(); },
    released: () => released,
    stdin,
  };

  const createQuery: NonNullable<ProviderRuntimeContext['createQuery']> = ({ prompt }) => {
    void (async () => {
      for await (const message of prompt) {
        stdin.push(message as Record<string, any>);
      }
      released = true;
    })();

    const iterator = (async function* () {
      for (;;) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => { wake = resolve; });
          wake = null;
          continue;
        }
        const next = queue.shift();
        if (next === null || next === undefined) {
          return;
        }
        yield next;
      }
    })();

    return Object.assign(iterator, {
      interrupt: async () => {},
      close: () => script.end(),
      stopTask: async () => {},
    });
  };

  return { createQuery, script };
}

async function withRun(
  runTest: (context: { script: Scripted; sent: NormalizedMessage[] }) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'claude-runtime-steer-'));
  const { createQuery, script } = createScriptedQuery();
  const sent: NormalizedMessage[] = [];
  const writer = { send: (message: NormalizedMessage) => { sent.push(message); }, userId: null };
  const sessions = new ClaudeSessionsProvider({ getLiveRunStartTime: () => null });
  const context: ProviderRuntimeContext = {
    resolveProviderSessionId: () => null,
    resolveResumeModel: async () => undefined,
    getProviderModels: async () => CLAUDE_PREDEFINED_MODELS as never,
    normalizeMessage: (raw, sessionId) => sessions.normalizeMessage(raw, sessionId),
    isProviderInstalled: async () => true,
    createQuery,
  };

  try {
    const done = queryClaudeSDK('hello', { sessionId: SESSION_ID, cwd }, writer as never, context);
    await runTest({ script, sent });
    script.end();
    await done;
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

const settle = () => new Promise((resolve) => { setTimeout(resolve, 25); });

// Run setup reads config off disk before the query starts, which can take
// longer than a fixed settle on a loaded machine; wait for the effect instead.
async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200 && !condition(); attempt += 1) {
    await settle();
  }
  assert.ok(condition(), 'condition never became true');
}

const init = () => ({ type: 'system', subtype: 'init', session_id: NATIVE_ID });
const assistantText = (text: string) => ({
  type: 'assistant', session_id: NATIVE_ID, parent_tool_use_id: null,
  message: { role: 'assistant', content: [{ type: 'text', text }] },
});
const result = () => ({ type: 'result', subtype: 'success', session_id: NATIVE_ID, result: 'done', duration_ms: 1, num_turns: 1 });

test('a steering message reaches the running turn after its current action', async () => {
  await withRun(async ({ script }) => {
    script.emit(init());
    await waitFor(() => script.stdin.length === 1);

    assert.equal(await steerClaudeSDKSession(SESSION_ID, { command: 'also check the tests' }), true);
    await settle();

    assert.equal(script.stdin.length, 2, 'the first prompt, then the steering message');
    const steered = script.stdin[1];
    assert.equal(steered.type, 'user');
    assert.equal(steered.priority, 'next');
    assert.equal(steered.message.content, 'also check the tests');
    assert.equal(script.released(), false);
  });
});

test('steering is refused once the turn has reported its result', async () => {
  await withRun(async ({ script, sent }) => {
    script.emit(init());
    script.emit(result());
    await waitFor(() => sent.some((message) => message.kind === 'complete'));

    assert.ok(sent.some((message) => message.kind === 'complete'));
    assert.equal(await steerClaudeSDKSession(SESSION_ID, { command: 'too late' }), false);
    assert.equal(script.stdin.length, 1, 'nothing more was written to the CLI');
  });
});

test('steering a session with no run is refused', async () => {
  assert.equal(await steerClaudeSDKSession('no-such-session', { command: 'hello' }), false);
});

test('a steered turn keeps the process open for a turn the message may still start', async () => {
  await withRun(async ({ script, sent }) => {
    script.emit(init());
    await waitFor(() => script.stdin.length === 1);
    assert.equal(await steerClaudeSDKSession(SESSION_ID, { command: 'one more thing' }), true);

    // The turn ends before the CLI got to the message: it starts a turn of its
    // own right after the result, which closing stdin now would drop.
    script.emit(result());
    await waitFor(() => sent.some((message) => message.kind === 'complete'));
    assert.equal(sent.filter((message) => message.kind === 'complete').length, 1);
    assert.equal(script.released(), false, 'stdin stays open for the steering message');

    script.emit(assistantText('Handling the extra request.'));
    await waitFor(() => hasActiveHeldTurn(SESSION_ID));
    assert.equal(hasActiveHeldTurn(SESSION_ID), true, 'the follow-up turn is tracked as a held turn');

    script.emit(result());
    await waitFor(() => script.released());
    assert.equal(sent.filter((message) => message.kind === 'complete').length, 1, 'the client hears of one completed turn');
  });
});

test('a turn nobody steered releases the process at its result', async () => {
  await withRun(async ({ script }) => {
    script.emit(init());
    script.emit(result());
    await waitFor(() => script.released());
  });
});
