import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, sessionDraftsDb, sessionsDb, userDb } from '@/modules/database/index.js';
import { handleChatConnection } from '@/modules/websocket/services/chat-websocket.service.js';
import { chatRunRegistry } from '@/modules/websocket/services/chat-run-registry.service.js';
import { connectedClients } from '@/modules/websocket/services/websocket-state.service.js';

const SESSION_ID = 'steered-session';

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

type SteerCall = { provider: string; sessionId: string; command: string };

/**
 * A gateway whose runtime takes or refuses every steering message as told.
 * `running` registers a run in progress for the session, the state a steer is
 * meant for.
 */
async function withGateway(
  options: { running: boolean; accepts: boolean },
  runTest: (context: {
    socket: ReturnType<typeof createFakeSocket>;
    steers: SteerCall[];
    userId: number;
  }) => Promise<void>,
): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'chat-steer-'));

  closeConnection();
  process.env.DATABASE_PATH = path.join(tempDirectory, 'auth.db');
  await initializeDatabase();

  const steers: SteerCall[] = [];
  const socket = createFakeSocket();

  try {
    const userId = Number(userDb.createUser('steerer', 'hash').id);
    sessionsDb.createAppSession(SESSION_ID, 'claude', tempDirectory);
    if (options.running) {
      chatRunRegistry.startRun({
        appSessionId: SESSION_ID,
        provider: 'claude',
        providerSessionId: null,
        connection: null,
        userId,
      });
    }

    handleChatConnection(
      socket as never,
      { user: { id: userId } } as never,
      {
        runtime: {
          steer: async (provider: string, sessionId: string, input: { command: string }) => {
            steers.push({ provider, sessionId, command: input.command });
            return options.accepts;
          },
        } as never,
      },
    );

    await runTest({ socket, steers, userId });
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

const queue = (userId: number, content: string) => {
  sessionDraftsDb.saveDraft(userId, SESSION_ID, { text: '', queuedMessage: { content, options: {}, attachments: [] } });
};

const steer = (socket: ReturnType<typeof createFakeSocket>, content: string) => {
  socket.emit('message', JSON.stringify({ type: 'chat.steer', sessionId: SESSION_ID, content, options: {} }));
};

test('chat.steer hands the message to the running turn and takes it off the queue', async () => {
  await withGateway({ running: true, accepts: true }, async ({ socket, steers, userId }) => {
    queue(userId, 'check the tests too');
    steer(socket, 'check the tests too');
    await settle();

    assert.deepEqual(steers, [{ provider: 'claude', sessionId: SESSION_ID, command: 'check the tests too' }]);
    assert.equal(socket.frames.length, 1);
    assert.equal(socket.frames[0].kind, 'steer_result');
    assert.equal(socket.frames[0].accepted, true);
    // The dispatcher must not send it again once the turn ends.
    assert.deepEqual(sessionDraftsDb.listQueuedMessages(), []);
  });
});

test('a steer the turn could not take leaves the message queued for the next turn', async () => {
  await withGateway({ running: true, accepts: false }, async ({ socket, userId }) => {
    queue(userId, 'too late');
    steer(socket, 'too late');
    await settle();

    assert.equal(socket.frames[0].kind, 'steer_result');
    assert.equal(socket.frames[0].accepted, false);
    const [stillQueued] = sessionDraftsDb.listQueuedMessages();
    assert.equal((stillQueued?.queuedMessage as { content?: string } | undefined)?.content, 'too late');
  });
});

test('a steer with no run in progress never reaches the runtime', async () => {
  await withGateway({ running: false, accepts: true }, async ({ socket, steers }) => {
    steer(socket, 'hello');
    await settle();

    assert.equal(steers.length, 0);
    assert.equal(socket.frames[0].kind, 'steer_result');
    assert.equal(socket.frames[0].accepted, false);
    assert.equal(socket.frames[0].reason, 'NO_ACTIVE_TURN');
  });
});

test('an empty steer is refused without touching the run', async () => {
  await withGateway({ running: true, accepts: true }, async ({ socket, steers }) => {
    steer(socket, '   ');
    await settle();

    assert.equal(steers.length, 0);
    assert.equal(socket.frames[0].reason, 'EMPTY_MESSAGE');
    // Not a protocol error: those make the client drop the session's spinner.
    assert.ok(socket.frames.every((frame) => frame.kind !== 'protocol_error'));
  });
});
