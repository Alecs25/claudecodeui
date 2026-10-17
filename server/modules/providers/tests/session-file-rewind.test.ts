import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, sessionsDb } from '@/modules/database/index.js';
import { providerRegistry } from '@/modules/providers/provider.registry.js';
import { sessionsService } from '@/modules/providers/services/sessions.service.js';
import type { IProviderRuntime } from '@/shared/interfaces.js';
import { AppError } from '@/shared/utils.js';

type RewindCall = Parameters<NonNullable<IProviderRuntime['rewindFiles']>>[0];

async function withDatabase(runTest: (context: { calls: RewindCall[]; directory: string }) => Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'session-file-rewind-'));
  closeConnection();
  process.env.DATABASE_PATH = path.join(directory, 'auth.db');
  await initializeDatabase();

  const calls: RewindCall[] = [];
  const runtime = providerRegistry.resolveProvider('claude').runtime;
  const realRewind = runtime.rewindFiles;
  runtime.rewindFiles = async (input) => {
    calls.push(input);
    return { canRewind: true, filesChanged: ['a.ts'] };
  };

  try {
    await runTest({ calls, directory });
  } finally {
    runtime.rewindFiles = realRewind;
    closeConnection();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

function seedSession(id: string, provider: string, directory: string, providerSessionId: string): void {
  const now = new Date().toISOString();
  sessionsDb.createSession(id, provider, directory, 'Session', now, now, path.join(directory, `${id}.jsonl`));
  sessionsDb.assignProviderSessionId(id, providerSessionId);
}

test('a file rewind runs in the session\'s directory against its provider-native id', async () => {
  await withDatabase(async ({ calls, directory }) => {
    seedSession('rewind-me', 'claude', directory, 'native-rewind');

    const result = await sessionsService.rewindSessionFiles('rewind-me', { anchorId: 'user-uuid', dryRun: true });

    assert.deepEqual(result, { canRewind: true, filesChanged: ['a.ts'] });
    assert.deepEqual(calls, [{
      sessionId: 'rewind-me',
      providerSessionId: 'native-rewind',
      cwd: directory,
      userMessageId: 'user-uuid',
      dryRun: true,
    }]);
  });
});

test('a file rewind is refused for providers without checkpoints and for sessions that never ran', async () => {
  await withDatabase(async ({ calls, directory }) => {
    seedSession('codex-session', 'codex', directory, 'native-codex');
    // An app-created session has no provider id until its first run reports one.
    sessionsDb.createAppSession('never-ran', 'claude', directory, 'New chat');

    await assert.rejects(
      sessionsService.rewindSessionFiles('codex-session', { anchorId: 'turn', dryRun: true }),
      (error: unknown) => error instanceof AppError && error.code === 'FILE_REWIND_NOT_SUPPORTED',
    );
    await assert.rejects(
      sessionsService.rewindSessionFiles('never-ran', { anchorId: 'user-uuid', dryRun: true }),
      (error: unknown) => error instanceof AppError && error.code === 'FILE_REWIND_SOURCE_NOT_READY',
    );
    assert.deepEqual(calls, []);
  });
});
