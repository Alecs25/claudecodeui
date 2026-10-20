import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, sessionsDb } from '@/modules/database/index.js';
import { chatRunRegistry } from '@/modules/websocket/services/chat-run-registry.service.js';
import type { ChatRunPromptChange } from '@/modules/websocket/services/chat-run-registry.service.js';
import { sessionRunStatus } from '@/modules/websocket/services/session-run-status.service.js';
import { viewerPresence } from '@/modules/websocket/services/viewer-presence.service.js';
import { connectedClients, WS_OPEN_STATE } from '@/modules/websocket/services/websocket-state.service.js';
import type { RealtimeClientConnection } from '@/shared/types.js';

/**
 * A session whose run waits on a prompt (a question, a plan, a permission) is
 * announced to every tab, so the sidebar shows the hand and a toast goes out
 * for a session nobody is looking at, even in tabs that never subscribed.
 */

type RecordingConnection = RealtimeClientConnection & { frames: Record<string, unknown>[] };

function createRecordingConnection(): RecordingConnection {
  const frames: Record<string, unknown>[] = [];
  return {
    readyState: WS_OPEN_STATE,
    frames,
    send(data: string) {
      frames.push(JSON.parse(data) as Record<string, unknown>);
    },
  };
}

async function withIsolatedDatabase(runTest: (connection: RecordingConnection) => void | Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'session-waiting-'));
  const connection = createRecordingConnection();

  closeConnection();
  process.env.DATABASE_PATH = path.join(tempDirectory, 'auth.db');
  await initializeDatabase();
  connectedClients.add(connection);

  try {
    await runTest(connection);
  } finally {
    connectedClients.clear();
    chatRunRegistry.clearAll();
    chatRunRegistry.setLifecycleListeners({});
    viewerPresence.clearAll();
    closeConnection();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

test('a run tracks the prompts it waits on until they are answered or the run ends', { concurrency: false }, async () => {
  await withIsolatedDatabase(() => {
    sessionsDb.createAppSession('waiting-run', 'claude', '/workspace/demo');
    const changes: ChatRunPromptChange[] = [];
    chatRunRegistry.setLifecycleListeners({
      onPromptsChanged: (_sessionId, _userId, change) => changes.push(change),
    });
    const run = chatRunRegistry.startRun({
      appSessionId: 'waiting-run',
      provider: 'claude',
      providerSessionId: null,
      connection: null,
      userId: null,
    });
    assert.ok(run);

    run.writer.send({ kind: 'permission_request', provider: 'claude', sessionId: 'p', requestId: 'q1', toolName: 'AskUserQuestion' });
    assert.deepEqual(changes.at(-1), {
      openPrompts: [{ requestId: 'q1', toolName: 'AskUserQuestion' }],
      opened: { requestId: 'q1', toolName: 'AskUserQuestion' },
    });
    assert.deepEqual(chatRunRegistry.listWaitingSessions().map((session) => session.sessionId), ['waiting-run']);

    run.writer.send({ kind: 'permission_resolved', provider: 'claude', sessionId: 'p', requestId: 'q1' });
    assert.deepEqual(changes.at(-1), { openPrompts: [], opened: null });
    assert.deepEqual(chatRunRegistry.listWaitingSessions(), []);

    run.writer.send({ kind: 'permission_request', provider: 'claude', sessionId: 'p', requestId: 'plan1', toolName: 'ExitPlanMode' });
    chatRunRegistry.completeRun('waiting-run', { exitCode: 0, aborted: true });
    assert.deepEqual(changes.at(-1), { openPrompts: [], opened: null });
    assert.equal(changes.length, 4);
  });
});

test('a prompt opened on a session nobody watches is announced as unseen to every tab', { concurrency: false }, async () => {
  await withIsolatedDatabase((connection) => {
    sessionsDb.createAppSession('unwatched', 'claude', '/workspace/demo');

    sessionRunStatus.handlePromptsChanged('unwatched', null, {
      openPrompts: [{ requestId: 'q1', toolName: 'AskUserQuestion' }],
      opened: { requestId: 'q1', toolName: 'AskUserQuestion' },
    });

    const frame = connection.frames.at(-1);
    assert.equal(frame?.kind, 'session_waiting');
    assert.equal(frame?.sessionId, 'unwatched');
    assert.deepEqual(frame?.requestIds, ['q1']);
    assert.equal(frame?.openedUnseen, true);
    assert.equal(frame?.openedToolName, 'AskUserQuestion');
    assert.equal(frame?.notify, true);

    sessionRunStatus.handlePromptsChanged('unwatched', null, { openPrompts: [], opened: null });
    assert.deepEqual(connection.frames.at(-1)?.requestIds, []);
    assert.equal(connection.frames.at(-1)?.openedUnseen, undefined);
  });
});

test('a prompt opened on a session on screen still marks it waiting, without the unseen toast', { concurrency: false }, async () => {
  await withIsolatedDatabase((connection) => {
    sessionsDb.createAppSession('watched', 'claude', '/workspace/demo');
    const viewer = createRecordingConnection();
    viewerPresence.update(viewer, { userId: null, sessionIds: ['watched'], visible: true });

    sessionRunStatus.handlePromptsChanged('watched', null, {
      openPrompts: [{ requestId: 'q1', toolName: 'AskUserQuestion' }],
      opened: { requestId: 'q1', toolName: 'AskUserQuestion' },
    });

    const frame = connection.frames.at(-1);
    assert.equal(frame?.kind, 'session_waiting');
    assert.deepEqual(frame?.requestIds, ['q1']);
    assert.equal(frame?.openedUnseen, undefined);
  });
});
