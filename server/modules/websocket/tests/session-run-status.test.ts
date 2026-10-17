import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, sessionsDb } from '@/modules/database/index.js';
import { parseRecentSessionsStatus, parseSessionStatusPatch, sessionsService } from '@/modules/providers/index.js';
import { sessionRunStatus } from '@/modules/websocket/services/session-run-status.service.js';
import { viewerPresence } from '@/modules/websocket/services/viewer-presence.service.js';
import { connectedClients, WS_OPEN_STATE } from '@/modules/websocket/services/websocket-state.service.js';
import type { RealtimeClientConnection } from '@/shared/types.js';

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
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'session-run-status-db-'));
  const connection = createRecordingConnection();

  closeConnection();
  process.env.DATABASE_PATH = path.join(tempDirectory, 'auth.db');
  await initializeDatabase();
  connectedClients.add(connection);

  try {
    await runTest(connection);
  } finally {
    connectedClients.delete(connection);
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

test('a run that ends unseen marks the session unread and announces it', { concurrency: false }, async () => {
  await withIsolatedDatabase((connection) => {
    sessionsDb.createAppSession('unseen-session', 'claude', '/tmp/status-project');

    sessionRunStatus.handleRunCompleted('unseen-session', null);

    assert.equal(sessionsDb.getSessionById('unseen-session')?.isUnread, 1);
    const frame = connection.frames.at(-1);
    assert.equal(frame?.kind, 'session_status');
    assert.equal(frame?.sessionId, 'unseen-session');
    assert.equal(frame?.isUnread, true);
    assert.equal(frame?.finishedUnseen, true);
    assert.equal(frame?.notify, true);
  });
});

test('a run that ends on screen in a visible tab stays read', { concurrency: false }, async () => {
  await withIsolatedDatabase((connection) => {
    sessionsDb.createAppSession('watched-session', 'claude', '/tmp/status-project');
    viewerPresence.update(connection, { userId: 1, sessionIds: ['watched-session'], visible: true });

    sessionRunStatus.handleRunCompleted('watched-session', 1);

    assert.equal(sessionsDb.getSessionById('watched-session')?.isUnread, 0);
    assert.equal(connection.frames.length, 0);
  });
});

test('a hidden tab does not count as viewing', { concurrency: false }, async () => {
  await withIsolatedDatabase((connection) => {
    sessionsDb.createAppSession('hidden-session', 'claude', '/tmp/status-project');
    viewerPresence.update(connection, { userId: 1, sessionIds: ['hidden-session'], visible: false });

    assert.equal(viewerPresence.isSessionViewed('hidden-session', 1), false);
    sessionRunStatus.handleRunCompleted('hidden-session', 1);
    assert.equal(sessionsDb.getSessionById('hidden-session')?.isUnread, 1);
  });
});

test('another user viewing the session does not suppress the unread mark', { concurrency: false }, async () => {
  await withIsolatedDatabase((connection) => {
    viewerPresence.update(connection, { userId: 2, sessionIds: ['shared-session'], visible: true });

    assert.equal(viewerPresence.isSessionViewed('shared-session', 1), false);
    assert.equal(viewerPresence.isSessionViewed('shared-session', 2), true);
  });
});

test('opening an unread session in a visible tab reads it', { concurrency: false }, async () => {
  await withIsolatedDatabase(() => {
    sessionsDb.createAppSession('read-me', 'claude', '/tmp/status-project');
    sessionsDb.updateSessionStatus('read-me', { isUnread: true });

    sessionRunStatus.markViewedSessionsRead(['read-me']);

    assert.equal(sessionsDb.getSessionById('read-me')?.isUnread, 0);
  });
});

test('a new run reopens a completed session', { concurrency: false }, async () => {
  await withIsolatedDatabase((connection) => {
    sessionsDb.createAppSession('done-session', 'claude', '/tmp/status-project');
    sessionsDb.updateSessionStatus('done-session', { isCompleted: true });

    sessionRunStatus.handleRunStarted('done-session');

    assert.equal(sessionsDb.getSessionById('done-session')?.isCompleted, 0);
    assert.equal(connection.frames.at(-1)?.isCompleted, false);
  });
});

test('setting the status keeps the activity timestamp and reports the flags', { concurrency: false }, async () => {
  await withIsolatedDatabase(() => {
    sessionsDb.createAppSession('pin-me', 'claude', '/tmp/status-project');
    const before = sessionsDb.getSessionById('pin-me')?.updated_at;

    const flags = sessionsService.setSessionStatusById('pin-me', { isPinned: true });

    assert.deepEqual(flags, { sessionId: 'pin-me', isPinned: true, isUnread: false, isCompleted: false });
    assert.equal(sessionsDb.getSessionById('pin-me')?.updated_at, before);
    assert.throws(
      () => sessionsService.setSessionStatusById('missing', { isPinned: true }),
      (error: unknown) => (error as { statusCode?: number }).statusCode === 404,
    );
  });
});

test('pinned sessions lead the recent feed and the filters narrow it', { concurrency: false }, async () => {
  await withIsolatedDatabase(async () => {
    sessionsDb.createSession('old', 'claude', '/tmp/feed-project', 'Old', '2026-08-01T08:00:00.000Z', '2026-08-01T08:00:00.000Z');
    sessionsDb.createSession('new', 'claude', '/tmp/feed-project', 'New', '2026-08-01T10:00:00.000Z', '2026-08-01T10:00:00.000Z');
    sessionsDb.updateSessionStatus('old', { isPinned: true });
    sessionsDb.updateSessionStatus('new', { isCompleted: true });

    const all = await sessionsService.listRecentSessions(10, 0);
    assert.deepEqual(all.conversations.map((item) => item.sessionId), ['old', 'new']);

    const completed = await sessionsService.listRecentSessions(10, 0, 'completed');
    assert.deepEqual(completed.conversations.map((item) => item.sessionId), ['new']);
    assert.equal(completed.total, 1);

    const running = await sessionsService.listRecentSessions(10, 0, 'running');
    assert.equal(running.total, 0);

    const projectPage = sessionsDb.getSessionsByProjectPathPage('/tmp/feed-project', 10, 0);
    assert.deepEqual(projectPage.map((row) => row.session_id), ['old', 'new']);
  });
});

test('status payloads are validated at the route boundary', () => {
  assert.deepEqual(parseSessionStatusPatch({ isPinned: true, other: 1 }), { isPinned: true });
  assert.throws(() => parseSessionStatusPatch({}), /At least one/);
  assert.throws(() => parseSessionStatusPatch({ isUnread: 'yes' }), /must be a boolean/);
  assert.equal(parseRecentSessionsStatus(undefined), null);
  assert.equal(parseRecentSessionsStatus('all'), null);
  assert.equal(parseRecentSessionsStatus('unread'), 'unread');
  assert.throws(() => parseRecentSessionsStatus('bogus'), /status must be one of/);
});
