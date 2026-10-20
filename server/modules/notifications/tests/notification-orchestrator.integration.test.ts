import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { WebSocket } from 'ws';

import {
  closeConnection,
  initializeDatabase,
  notificationPreferencesDb,
  sessionsDb,
  userDb,
} from '@/modules/database/index.js';

import {
  registerDesktopNotificationClient,
  unregisterDesktopNotificationClient,
} from '../services/desktop-notification-clients.service.js';
import {
  buildNotificationPayload,
  createNotificationEvent,
  notifyUserIfEnabled,
  notifyRunFailed,
  notifyRunStopped,
  setSessionViewedCheck,
} from '../services/notification-orchestrator.service.js';

async function withIsolatedDatabase(runTest: () => void | Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'notification-orchestrator-'));
  const databasePath = path.join(temporaryDirectory, 'auth.db');

  closeConnection();
  process.env.DATABASE_PATH = databasePath;
  await initializeDatabase();

  try {
    await runTest();
  } finally {
    closeConnection();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

test('notification payload uses the app session id for a provider session id', async () => {
  await withIsolatedDatabase(() => {
    sessionsDb.createAppSession('app-session-1', 'claude', '/workspace/demo');
    sessionsDb.assignProviderSessionId('app-session-1', 'claude-native-1');

    const payload = buildNotificationPayload({
      provider: 'claude',
      sessionId: 'claude-native-1',
      kind: 'stop',
      code: 'run.stopped',
      meta: { stopReason: 'completed' },
    });

    assert.equal(payload.data.sessionId, 'app-session-1');
    assert.match(payload.data.tag, /app-session-1/);
  });
});

test('completion notifications skip a session on screen, other kinds still go out', async () => {
  await withIsolatedDatabase(async () => {
    const { id: userId } = userDb.createUser('viewer', 'hash');
    notificationPreferencesDb.updatePreferences(Number(userId), {
      channels: { desktop: true },
      events: { stop: true, error: true, actionRequired: true },
    });
    const sent: string[] = [];
    const fakeSocket = { readyState: 1, OPEN: 1, send: (message: string) => sent.push(message), close: () => {} };
    registerDesktopNotificationClient({ userId: Number(userId), deviceId: 'device-1', ws: fakeSocket as unknown as WebSocket });
    setSessionViewedCheck((sessionId: string) => sessionId === 'watched');

    try {
      // The JS signatures infer `sessionId` as null from its default.
      const notifyStopped = notifyRunStopped as unknown as (input: Record<string, unknown>) => void;
      const notifyFailed = notifyRunFailed as unknown as (input: Record<string, unknown>) => void;
      notifyStopped({ userId, provider: 'claude', sessionId: 'watched', stopReason: 'done-watched' });
      notifyStopped({ userId, provider: 'claude', sessionId: 'elsewhere', stopReason: 'done-elsewhere' });
      notifyFailed({ userId, provider: 'claude', sessionId: 'watched', error: 'boom-watched' });
      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(sent.length, 2);
      assert.ok(sent.some((message) => message.includes('done-elsewhere')));
      assert.ok(sent.some((message) => message.includes('boom-watched')));
    } finally {
      setSessionViewedCheck(null);
      unregisterDesktopNotificationClient(fakeSocket as unknown as WebSocket);
    }
  });
});

test('a question or plan waiting reads as Claude waiting for an answer, and skips a session on screen', async () => {
  await withIsolatedDatabase(async () => {
    const payload = buildNotificationPayload({
      provider: 'claude',
      sessionId: null,
      kind: 'action_required',
      code: 'question.pending',
      meta: { toolName: 'AskUserQuestion', sessionName: 'LICENSEPLANET' },
    });
    assert.equal(payload.title, 'LICENSEPLANET');
    assert.equal(payload.body, 'Claude is waiting for your answer');
    assert.equal(payload.data.code, 'question.pending');

    const { id: userId } = userDb.createUser('asker', 'hash');
    notificationPreferencesDb.updatePreferences(Number(userId), {
      channels: { desktop: true },
      events: { stop: true, error: true, actionRequired: true },
    });
    const sent: string[] = [];
    const fakeSocket = { readyState: 1, OPEN: 1, send: (message: string) => sent.push(message), close: () => {} };
    registerDesktopNotificationClient({ userId: Number(userId), deviceId: 'device-1', ws: fakeSocket as unknown as WebSocket });
    setSessionViewedCheck((sessionId: string) => sessionId === 'watched');

    try {
      const notify = notifyUserIfEnabled as unknown as (input: Record<string, unknown>) => void;
      const create = createNotificationEvent as unknown as (input: Record<string, unknown>) => unknown;
      for (const sessionId of ['watched', 'elsewhere']) {
        notify({
          userId,
          event: create({
            provider: 'claude',
            sessionId,
            kind: 'action_required',
            code: 'question.pending',
            meta: { toolName: 'AskUserQuestion' },
            dedupeKey: `question:${sessionId}`,
          }),
        });
      }
      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(sent.length, 1);
      assert.ok(sent[0].includes('elsewhere'));
    } finally {
      setSessionViewedCheck(null);
      unregisterDesktopNotificationClient(fakeSocket as unknown as WebSocket);
    }
  });
});
