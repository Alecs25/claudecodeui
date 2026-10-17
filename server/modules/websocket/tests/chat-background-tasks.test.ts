import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, sessionsDb } from '@/modules/database/index.js';
import { handleChatConnection } from '@/modules/websocket/services/chat-websocket.service.js';
import { chatRunRegistry } from '@/modules/websocket/services/chat-run-registry.service.js';
import { connectedClients } from '@/modules/websocket/services/websocket-state.service.js';

const SESSION_ID = 'held-session';

function createFakeSocket() {
  const socket = new EventEmitter() as EventEmitter & {
    readyState: number;
    frames: Array<Record<string, unknown>>;
    send: (data: string) => void;
  };
  socket.readyState = 1;
  socket.frames = [];
  socket.send = (data: string) => socket.frames.push(JSON.parse(data) as Record<string, unknown>);
  return socket;
}

type BackgroundCall = { provider: string; sessionId: string; toolUseId?: string };

/** A gateway whose runtime has one foreground call in flight, `toolu_bash_1`. */
async function withGateway(
  runTest: (context: { socket: ReturnType<typeof createFakeSocket>; calls: BackgroundCall[] }) => Promise<void>,
): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'chat-background-tasks-'));

  closeConnection();
  process.env.DATABASE_PATH = path.join(tempDirectory, 'auth.db');
  await initializeDatabase();

  const calls: BackgroundCall[] = [];
  const socket = createFakeSocket();

  try {
    sessionsDb.createAppSession(SESSION_ID, 'claude', tempDirectory);

    handleChatConnection(
      socket as never,
      { user: { id: 1 } } as never,
      {
        runtime: {
          backgroundTasks: async (provider: string, sessionId: string, toolUseId?: string) => {
            calls.push({ provider, sessionId, ...(toolUseId ? { toolUseId } : {}) });
            return toolUseId === undefined || toolUseId === 'toolu_bash_1';
          },
        } as never,
      },
    );

    await runTest({ socket, calls });
  } finally {
    connectedClients.clear();
    chatRunRegistry.clearAll();
    closeConnection();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

/** The handler is async and the socket listener does not await it. */
const settle = () => new Promise((resolve) => { setTimeout(resolve, 30); });

test('chat.background-tasks moves the foreground tasks through the provider runtime of the session', async () => {
  await withGateway(async ({ socket, calls }) => {
    socket.emit('message', JSON.stringify({ type: 'chat.background-tasks', sessionId: SESSION_ID }));
    socket.emit('message', JSON.stringify({ type: 'chat.background-tasks', sessionId: SESSION_ID, toolUseId: 'toolu_bash_1' }));
    await settle();

    // The provider comes from the session row, never from the frame.
    assert.deepEqual(calls, [
      { provider: 'claude', sessionId: SESSION_ID },
      { provider: 'claude', sessionId: SESSION_ID, toolUseId: 'toolu_bash_1' },
    ]);
    // The runtime reports the task on the session's stream; nothing is echoed here.
    assert.deepEqual(socket.frames, []);
  });
});

test('a call that is no longer in the foreground is refused with NO_FOREGROUND_TASK', async () => {
  await withGateway(async ({ socket }) => {
    socket.emit('message', JSON.stringify({ type: 'chat.background-tasks', sessionId: SESSION_ID, toolUseId: 'toolu_done' }));
    await settle();

    assert.equal(socket.frames.length, 1);
    assert.equal(socket.frames[0].kind, 'protocol_error');
    assert.equal(socket.frames[0].code, 'NO_FOREGROUND_TASK');
    assert.equal(socket.frames[0].sessionId, SESSION_ID);
    assert.equal(socket.frames[0].toolUseId, 'toolu_done');
  });
});

test('a request without a session id never reaches the runtime', async () => {
  await withGateway(async ({ socket, calls }) => {
    socket.emit('message', JSON.stringify({ type: 'chat.background-tasks' }));
    await settle();

    assert.equal(calls.length, 0);
    assert.equal(socket.frames.at(-1)?.code, 'SESSION_ID_REQUIRED');
  });
});
