import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, initializeDatabase, sessionsDb } from '@/modules/database/index.js';
import {
  buildDesktopIndex,
  getDesktopParentSessionIds,
  getDesktopSessionTitle,
  resetDesktopIndexCache,
  resolveDesktopSessionsDirectories,
} from '@/modules/providers/list/claude/claude-desktop-titles.js';
import { createSessionParentResolver } from '@/modules/providers/services/session-parents.service.js';

async function withTempDirectory(runTest: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'claude-desktop-sessions-'));
  try {
    await runTest(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeSessionFile(
  sessionsDirectory: string,
  localId: string,
  data: Record<string, unknown>,
  modifiedAt?: Date,
): Promise<void> {
  const accountDirectory = path.join(sessionsDirectory, 'account', 'org');
  await mkdir(accountDirectory, { recursive: true });
  const filePath = path.join(accountDirectory, `${localId}.json`);
  await writeFile(filePath, JSON.stringify({ sessionId: localId, ...data }), 'utf8');
  if (modifiedAt) {
    await utimes(filePath, modifiedAt, modifiedAt);
  }
}

test('Windows: packaged data first, then roaming, then the package cache; missing ones skipped', async () => {
  await withTempDirectory(async (root) => {
    const localAppData = path.join(root, 'Local');
    const roamingAppData = path.join(root, 'Roaming');
    const packaged = path.join(localAppData, 'Claude-Data', 'claude_pzs8sxrjxfjjc', 'claude-code-sessions');
    const roaming = path.join(roamingAppData, 'Claude', 'claude-code-sessions');
    const packageCache = path.join(
      localAppData, 'Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Roaming', 'Claude', 'claude-code-sessions',
    );
    await mkdir(packaged, { recursive: true });
    await mkdir(packageCache, { recursive: true });
    // A folder that is not the app's must not be picked up.
    await mkdir(path.join(localAppData, 'Claude-Data', 'other', 'claude-code-sessions'), { recursive: true });

    const environment = {
      platform: 'win32' as const,
      homeDirectory: root,
      env: { LOCALAPPDATA: localAppData, APPDATA: roamingAppData },
    };
    assert.deepEqual(await resolveDesktopSessionsDirectories(environment), [packaged, packageCache]);

    await mkdir(roaming, { recursive: true });
    assert.deepEqual(await resolveDesktopSessionsDirectories(environment), [packaged, roaming, packageCache]);
  });
});

test('macOS and Linux keep their single location', async () => {
  await withTempDirectory(async (home) => {
    const mac = path.join(home, 'Library', 'Application Support', 'Claude', 'claude-code-sessions');
    const linux = path.join(home, '.config', 'Claude', 'claude-code-sessions');
    await mkdir(mac, { recursive: true });
    await mkdir(linux, { recursive: true });

    assert.deepEqual(await resolveDesktopSessionsDirectories({ platform: 'darwin', homeDirectory: home, env: {} }), [mac]);
    assert.deepEqual(await resolveDesktopSessionsDirectories({ platform: 'linux', homeDirectory: home, env: {} }), [linux]);
  });
});

test('the newest file wins for a session id found in two directories', () => {
  const index = buildDesktopIndex([
    {
      mtimeMs: 1,
      parsed: { localSessionId: 'local_a', cliSessionId: 'cli-a', title: { title: 'Old', isChosenTitle: false }, spawnedFromLocalId: null },
    },
    {
      mtimeMs: 2,
      parsed: { localSessionId: 'local_a', cliSessionId: 'cli-a', title: { title: 'New', isChosenTitle: true }, spawnedFromLocalId: null },
    },
  ]);
  assert.deepEqual(index.titles.get('cli-a'), { title: 'New', isChosenTitle: true });
});

test('a spawned session links to its parent only when the parent file is there', () => {
  const index = buildDesktopIndex([
    { mtimeMs: 1, parsed: { localSessionId: 'local_p', cliSessionId: 'cli-p', title: null, spawnedFromLocalId: null } },
    { mtimeMs: 1, parsed: { localSessionId: 'local_c', cliSessionId: 'cli-c', title: null, spawnedFromLocalId: 'local_p' } },
    { mtimeMs: 1, parsed: { localSessionId: 'local_o', cliSessionId: 'cli-o', title: null, spawnedFromLocalId: 'local_gone' } },
    { mtimeMs: 1, parsed: { localSessionId: 'local_s', cliSessionId: 'cli-s', title: null, spawnedFromLocalId: 'local_s' } },
  ]);
  assert.deepEqual([...index.parents], [['cli-c', 'cli-p']]);
});

test('titles and parent links are read from the session files', async () => {
  await withTempDirectory(async (root) => {
    const previous = process.env.CLOUDCLI_CLAUDE_DESKTOP_DIR;
    process.env.CLOUDCLI_CLAUDE_DESKTOP_DIR = root;
    resetDesktopIndexCache();
    try {
      const sessionsDirectory = path.join(root, 'claude-code-sessions');
      await writeSessionFile(sessionsDirectory, 'local_11111111-0000-0000-0000-000000000000', {
        cliSessionId: 'cli-parent', title: 'LICENSEPLANET', titleSource: 'user',
      });
      await writeSessionFile(sessionsDirectory, 'local_22222222-0000-0000-0000-000000000000', {
        cliSessionId: 'cli-child',
        title: 'LICENSEPLANET \\ COOKIE',
        titleSource: 'auto',
        spawnedFrom: { sessionId: 'local_11111111-0000-0000-0000-000000000000', taskId: 'task_1', title: 'Cookie' },
      });

      assert.deepEqual(await getDesktopSessionTitle('cli-parent'), { title: 'LICENSEPLANET', isChosenTitle: true });
      assert.deepEqual(await getDesktopSessionTitle('cli-child'), { title: 'LICENSEPLANET \\ COOKIE', isChosenTitle: false });
      assert.deepEqual([...(await getDesktopParentSessionIds())], [['cli-child', 'cli-parent']]);
    } finally {
      resetDesktopIndexCache();
      if (previous === undefined) {
        delete process.env.CLOUDCLI_CLAUDE_DESKTOP_DIR;
      } else {
        process.env.CLOUDCLI_CLAUDE_DESKTOP_DIR = previous;
      }
    }
  });
});

test('parent links resolve to the app session ids the client knows', async () => {
  await withTempDirectory(async (root) => {
    const previousDatabasePath = process.env.DATABASE_PATH;
    closeConnection();
    process.env.DATABASE_PATH = path.join(root, 'auth.db');
    await initializeDatabase();
    try {
      const projectPath = path.join(root, 'project');
      // The parent was started in CloudCLI, so its app id differs from its Claude Code id.
      sessionsDb.createAppSession('app-parent', 'claude', projectPath, 'Parent');
      sessionsDb.assignProviderSessionId('app-parent', 'cli-parent');
      sessionsDb.createSession('cli-child', 'claude', projectPath, 'Child');
      sessionsDb.createSession('cli-orphan', 'claude', projectPath, 'Orphan');
      sessionsDb.createSession('cli-archived-parent', 'claude', projectPath, 'Archived');
      sessionsDb.updateSessionIsArchived('cli-archived-parent', true);
      sessionsDb.createSession('cli-archived-child', 'claude', projectPath, 'Child of archived');

      const resolveParent = createSessionParentResolver(new Map([
        ['cli-child', 'cli-parent'],
        ['cli-orphan', 'cli-unknown'],
        ['cli-archived-child', 'cli-archived-parent'],
      ]));
      const rowOf = (sessionId: string) => sessionsDb.getSessionById(sessionId) ?? sessionsDb.getSessionByProviderSessionId(sessionId);

      assert.equal(resolveParent(rowOf('cli-child')!), 'app-parent');
      assert.equal(resolveParent(rowOf('cli-orphan')!), null);
      assert.equal(resolveParent(rowOf('cli-archived-child')!), null);
      assert.equal(resolveParent(rowOf('app-parent')!), null);
      assert.equal(resolveParent({ session_id: 'cli-child', provider: 'codex', provider_session_id: 'cli-child' }), null);
    } finally {
      closeConnection();
      if (previousDatabasePath === undefined) {
        delete process.env.DATABASE_PATH;
      } else {
        process.env.DATABASE_PATH = previousDatabasePath;
      }
    }
  });
});
