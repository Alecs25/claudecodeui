import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ClaudeSessionsProvider } from '@/modules/providers/list/claude/claude-sessions.provider.js';
import { CLAUDE_PREDEFINED_MODELS } from '@/modules/providers/list/claude/claude-models.provider.js';
import {
  applyClaudeSDKSessionSettings,
  buildLiveEffortSettings,
  queryClaudeSDK,
  rewindClaudeSDKFiles,
} from '@/modules/providers/list/claude/claude-runtime.provider.js';
import type { ProviderRuntimeContext } from '@/shared/types.js';

/**
 * File rewind and mid-session model/effort changes both talk to a Claude
 * process over SDK control requests. These drive the runtime with a stand-in
 * query that records what it was asked, the same seam the hold tests use.
 */

type FakeQuery = AsyncIterable<unknown> & {
  options: Record<string, unknown>;
  calls: unknown[][];
  promptEnded: () => boolean;
  end: () => void;
  interrupt(): Promise<void>;
  close(): void;
  setModel(model?: string): Promise<void>;
  applyFlagSettings(settings: Record<string, unknown>): Promise<void>;
  rewindFiles(userMessageId: string, options?: { dryRun?: boolean }): Promise<unknown>;
};

function createFakeQuery(input: { prompt: AsyncIterable<unknown>; options: Record<string, unknown> }): FakeQuery {
  let promptEnded = false;
  let finish: (() => void) | null = null;
  const finished = new Promise<void>((resolve) => { finish = resolve; });
  const calls: unknown[][] = [];

  void (async () => {
    for await (const _message of input.prompt) { /* the CLI reads its stdin */ }
    promptEnded = true;
  })();

  // Yields nothing: the run only needs a stream that stays open until the test ends it.
  const iterator = (async function* () {
    await finished;
    yield* [];
  })();

  return Object.assign(iterator, {
    options: input.options,
    calls,
    promptEnded: () => promptEnded,
    end: () => finish?.(),
    interrupt: async () => { calls.push(['interrupt']); },
    close: () => { calls.push(['close']); finish?.(); },
    setModel: async (model?: string) => { calls.push(['setModel', model]); },
    applyFlagSettings: async (settings: Record<string, unknown>) => { calls.push(['applyFlagSettings', settings]); },
    rewindFiles: async (userMessageId: string, options?: { dryRun?: boolean }) => {
      calls.push(['rewindFiles', userMessageId, options]);
      return { canRewind: true, filesChanged: ['/repo/a.ts'], insertions: 1, deletions: 2 };
    },
  });
}

const settle = () => new Promise((resolve) => { setTimeout(resolve, 25); });

async function withLiveRun(sessionId: string, runTest: (query: FakeQuery) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'claude-live-controls-'));
  let created: FakeQuery | null = null;
  const sessions = new ClaudeSessionsProvider({ getLiveRunStartTime: () => null });
  const context: ProviderRuntimeContext = {
    resolveProviderSessionId: () => null,
    resolveResumeModel: async () => undefined,
    getProviderModels: async () => CLAUDE_PREDEFINED_MODELS as never,
    normalizeMessage: (raw, id) => sessions.normalizeMessage(raw, id),
    isProviderInstalled: async () => true,
    createQuery: (input) => {
      created = createFakeQuery(input as never);
      return created;
    },
  };
  const writer = { send: () => {}, userId: null };

  try {
    const done = queryClaudeSDK('hello', { sessionId, cwd }, writer as never, context);
    for (let attempt = 0; attempt < 100 && !created; attempt += 1) {
      await settle();
    }
    assert.ok(created, 'the run never created its query');
    await runTest(created);
    (created as FakeQuery).end();
    await done;
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test('new runs enable file checkpointing, so their turns can be rewound', async () => {
  await withLiveRun('app-live-checkpoint', async (query) => {
    assert.equal(query.options.enableFileCheckpointing, true);
  });
});

test('a model and effort picked mid-run reach the live process', async () => {
  await withLiveRun('app-live-settings', async (query) => {
    assert.equal(await applyClaudeSDKSessionSettings('app-live-settings', { model: 'opus', effort: 'high' }), true);
    assert.deepEqual(query.calls, [
      ['setModel', 'opus'],
      ['applyFlagSettings', { effortLevel: 'high', ultracode: null }],
    ]);
  });

  // Once the run is over there is nothing to update: the next run reads the stored choice.
  assert.equal(await applyClaudeSDKSessionSettings('app-live-settings', { model: 'sonnet' }), false);
});

test('effort choices map onto the flag settings a live process understands', () => {
  assert.deepEqual(buildLiveEffortSettings('default'), { effortLevel: null, ultracode: null });
  assert.deepEqual(buildLiveEffortSettings('max'), { effortLevel: 'max', ultracode: null });
  assert.deepEqual(buildLiveEffortSettings('ultracode'), { effortLevel: 'xhigh', ultracode: true, enableWorkflows: true });
});

test('a file rewind with no live process resumes the session just to answer it, then closes', async () => {
  let created: FakeQuery | null = null;
  const result = await rewindClaudeSDKFiles(
    { sessionId: 'app-idle', providerSessionId: 'native-idle', cwd: '/repo', userMessageId: 'user-uuid', dryRun: true },
    { createQuery: (input: { prompt: AsyncIterable<unknown>; options: Record<string, unknown> }) => (created = createFakeQuery(input)) },
  );
  await settle();

  assert.deepEqual(result, { canRewind: true, filesChanged: ['/repo/a.ts'], insertions: 1, deletions: 2 });
  assert.ok(created);
  const query = created as FakeQuery;
  assert.equal(query.options.resume, 'native-idle');
  assert.equal(query.options.enableFileCheckpointing, true);
  assert.equal(query.options.cwd, '/repo');
  // Nothing from the user's settings (hooks, plugins) runs for a restore.
  assert.deepEqual(query.options.settingSources, []);
  assert.deepEqual(query.calls, [['rewindFiles', 'user-uuid', { dryRun: true }], ['close']]);
  assert.equal(query.promptEnded(), true);
});

test('a file rewind on a session with a live process asks that process', async () => {
  await withLiveRun('app-live-rewind', async (query) => {
    let spawned = false;
    const result = await rewindClaudeSDKFiles(
      { sessionId: 'app-live-rewind', providerSessionId: 'native', cwd: '/repo', userMessageId: 'user-uuid', dryRun: false },
      { createQuery: () => { spawned = true; throw new Error('should not spawn'); } },
    );
    assert.equal(spawned, false);
    assert.equal((result as { canRewind: boolean }).canRewind, true);
    assert.deepEqual(query.calls, [['rewindFiles', 'user-uuid', { dryRun: false }]]);
  });
});
