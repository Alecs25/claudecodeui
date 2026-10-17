import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, sessionsDb } from '@/modules/database/index.js';
import { ClaudeSessionsProvider } from '@/modules/providers/list/claude/claude-sessions.provider.js';

/**
 * A message the user sends while a turn is running (a CloudCLI steer, or text
 * typed mid-turn in the CLI) is stored by Claude Code as a `queued_command`
 * attachment row, not a user row. It has to read back as the user's message.
 * Synthetic data only.
 */

const SESSION_ID = 'claude-steered-prompt-1';

const queuedCommand = (prompt: unknown, extra: Record<string, unknown> = {}) => ({
  type: 'attachment',
  uuid: 'att-1',
  parentUuid: 'a-1',
  isSidechain: false,
  timestamp: '2026-01-01T00:00:05.000Z',
  attachment: {
    type: 'queued_command',
    prompt,
    commandMode: 'prompt',
    origin: { kind: 'human' },
    ...extra,
  },
});

test('a queued_command attachment normalizes to a user text message', () => {
  const rows = new ClaudeSessionsProvider().normalizeMessage(queuedCommand('also update the docs'), SESSION_ID);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'text');
  assert.equal(rows[0].role, 'user');
  assert.equal(rows[0].content, 'also update the docs');
  assert.equal(rows[0].transcriptAnchorId, 'att-1');
});

test('a queued_command whose prompt is content blocks keeps its text', () => {
  const rows = new ClaudeSessionsProvider().normalizeMessage(
    queuedCommand([{ type: 'text', text: 'look at this' }, { type: 'image', source: {} }]),
    SESSION_ID,
  );
  assert.equal(rows[0]?.content, 'look at this');
});

test('queued commands the user did not type are not shown as user messages', () => {
  const provider = new ClaudeSessionsProvider();
  assert.deepEqual(provider.normalizeMessage(queuedCommand('<task-notification>', { origin: { kind: 'task' } }), SESSION_ID), []);
  assert.deepEqual(provider.normalizeMessage(queuedCommand('/compact', { commandMode: 'bash' }), SESSION_ID), []);
});

test('Claude history shows a steered message between the turns it joined', { concurrency: false }, async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'claude-steered-history-'));
  const previousDatabasePath = process.env.DATABASE_PATH;

  try {
    const transcriptPath = path.join(tempRoot, `${SESSION_ID}.jsonl`);
    const rows = [
      {
        type: 'user', uuid: 'u-1', parentUuid: null, isSidechain: false, sessionId: SESSION_ID,
        timestamp: '2026-01-01T00:00:00.000Z',
        message: { role: 'user', content: 'refactor the parser' },
      },
      {
        type: 'assistant', uuid: 'a-1', parentUuid: 'u-1', isSidechain: false, sessionId: SESSION_ID,
        timestamp: '2026-01-01T00:00:01.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Working on it.' }] },
      },
      { ...queuedCommand('keep the old API too'), sessionId: SESSION_ID },
      {
        type: 'assistant', uuid: 'a-2', parentUuid: 'att-1', isSidechain: false, sessionId: SESSION_ID,
        timestamp: '2026-01-01T00:00:06.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Keeping the old API.' }] },
      },
    ];
    await writeFile(transcriptPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');

    closeConnection();
    process.env.DATABASE_PATH = path.join(tempRoot, 'auth.db');
    await initializeDatabase();
    const now = new Date().toISOString();
    sessionsDb.createSession(SESSION_ID, 'claude', tempRoot, 'Steered session', now, now, transcriptPath);

    const history = await new ClaudeSessionsProvider().fetchHistory(SESSION_ID, { providerSessionId: SESSION_ID });
    const said = history.messages
      .filter((message) => message.kind === 'text')
      .map((message) => `${message.role}: ${message.content}`);
    assert.deepEqual(said, [
      'user: refactor the parser',
      'assistant: Working on it.',
      'user: keep the old API too',
      'assistant: Keeping the old API.',
    ]);
  } finally {
    closeConnection();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(tempRoot, { recursive: true, force: true });
  }
});
