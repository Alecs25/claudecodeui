import os from 'node:os';
import path from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';

/**
 * Session metadata from the Claude desktop app.
 *
 * The desktop app keeps its titles (the ones the user types in its sidebar, or
 * the ones it generates) in its own metadata, one `local_<id>.json` per session
 * under `claude-code-sessions/<account>/<org>/`, never in the transcript. CloudCLI
 * reads the transcript, so without this a session renamed "HT \ CLOUDCLI" in the
 * app shows up here under Claude Code's own summary.
 *
 * The same files say which session a task chip was spawned from
 * (`spawnedFrom.sessionId` = the parent's `local_<id>`), which is how the app
 * nests child sessions under their parent in its sidebar.
 */

export type DesktopSessionTitle = {
  title: string;
  /**
   * True when the title was chosen — typed by the user in the app ('user') or
   * set by the agent's session-title tool ('tool') — rather than generated.
   */
  isChosenTitle: boolean;
};

export type DesktopSessionFile = {
  /** The app's own id, `local_<uuid>`, which `spawnedFrom.sessionId` refers to. */
  localSessionId: string;
  cliSessionId: string;
  title: DesktopSessionTitle | null;
  /** `local_<uuid>` of the session this one was spawned from. */
  spawnedFromLocalId: string | null;
};

type DesktopIndex = {
  titles: Map<string, DesktopSessionTitle>;
  /** Child Claude Code session id → parent Claude Code session id. */
  parents: Map<string, string>;
};

type ReadSessionFile = { mtimeMs: number; parsed: DesktopSessionFile };

const SESSIONS_DIRECTORY_NAME = 'claude-code-sessions';
const CHOSEN_TITLE_SOURCES = new Set(['user', 'tool']);
const SESSION_FILE_PATTERN = /^local_[0-9a-f-]+\.json$/i;
// synchronizeFile runs on every transcript write while a session streams; the
// index is a directory walk, so it is rebuilt at most this often.
const INDEX_TTL_MS = 10_000;
const ACCOUNT_DIRECTORY_DEPTH = 2;
// Since the desktop app became an MSIX package (October 2026) its data lives in
// `%LOCALAPPDATA%\Claude-Data\claude_<package hash>\`, and `%APPDATA%\Claude`
// only holds a `.user-data-left.*` marker.
const PACKAGED_DATA_DIRECTORY_NAME = 'Claude-Data';
const PACKAGED_DATA_SUBDIRECTORY_PATTERN = /^claude_/i;
const PACKAGES_DIRECTORY_NAME = 'Packages';
const PACKAGE_DIRECTORY_PATTERN = /^Claude_/i;

type DirectoryEnvironment = {
  platform: NodeJS.Platform;
  homeDirectory: string;
  env: NodeJS.ProcessEnv;
};

async function listSubdirectories(directory: string, namePattern: RegExp): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && namePattern.test(entry.name))
      .map((entry) => path.join(directory, entry.name))
      .sort();
  } catch {
    return [];
  }
}

async function directoryExists(directory: string): Promise<boolean> {
  try {
    return (await stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Every `claude-code-sessions` directory the desktop app may be using, in
 * priority order. Several can exist at once (the packaged location next to a
 * leftover pre-package one); the index merges all of them.
 */
export async function resolveDesktopSessionsDirectories(
  environment: DirectoryEnvironment = { platform: process.platform, homeDirectory: os.homedir(), env: process.env },
): Promise<string[]> {
  const { platform, homeDirectory, env } = environment;
  const candidates: string[] = [];

  if (env.CLOUDCLI_CLAUDE_DESKTOP_DIR) {
    candidates.push(path.join(env.CLOUDCLI_CLAUDE_DESKTOP_DIR, SESSIONS_DIRECTORY_NAME));
  } else if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA || path.join(homeDirectory, 'AppData', 'Local');
    const roamingAppData = env.APPDATA || path.join(homeDirectory, 'AppData', 'Roaming');

    const packagedDataDirectories = await listSubdirectories(
      path.join(localAppData, PACKAGED_DATA_DIRECTORY_NAME),
      PACKAGED_DATA_SUBDIRECTORY_PATTERN,
    );
    candidates.push(...packagedDataDirectories.map((directory) => path.join(directory, SESSIONS_DIRECTORY_NAME)));
    candidates.push(path.join(roamingAppData, 'Claude', SESSIONS_DIRECTORY_NAME));

    const packageDirectories = await listSubdirectories(
      path.join(localAppData, PACKAGES_DIRECTORY_NAME),
      PACKAGE_DIRECTORY_PATTERN,
    );
    candidates.push(...packageDirectories.map(
      (directory) => path.join(directory, 'LocalCache', 'Roaming', 'Claude', SESSIONS_DIRECTORY_NAME),
    ));
  } else if (platform === 'darwin') {
    candidates.push(path.join(homeDirectory, 'Library', 'Application Support', 'Claude', SESSIONS_DIRECTORY_NAME));
  } else {
    const configDirectory = env.XDG_CONFIG_HOME || path.join(homeDirectory, '.config');
    candidates.push(path.join(configDirectory, 'Claude', SESSIONS_DIRECTORY_NAME));
  }

  const existing = await Promise.all(candidates.map(directoryExists));
  return candidates.filter((_, index) => existing[index]);
}

async function listSessionFiles(directory: string, depth: number): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  if (depth === 0) {
    return entries
      .filter((entry) => entry.isFile() && SESSION_FILE_PATTERN.test(entry.name))
      .map((entry) => path.join(directory, entry.name));
  }

  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => listSessionFiles(path.join(directory, entry.name), depth - 1)),
  );
  return nested.flat();
}

function parseSessionFile(filePath: string, content: string): DesktopSessionFile | null {
  const data = JSON.parse(content) as Record<string, unknown>;
  const cliSessionId = typeof data.cliSessionId === 'string' ? data.cliSessionId : '';
  if (!cliSessionId) {
    return null;
  }

  const localSessionId = typeof data.sessionId === 'string' && data.sessionId
    ? data.sessionId
    : path.basename(filePath, '.json');
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const spawnedFrom = data.spawnedFrom as Record<string, unknown> | null | undefined;
  const spawnedFromLocalId = spawnedFrom && typeof spawnedFrom.sessionId === 'string' && spawnedFrom.sessionId
    ? spawnedFrom.sessionId
    : null;

  return {
    localSessionId,
    cliSessionId,
    title: title ? { title, isChosenTitle: CHOSEN_TITLE_SOURCES.has(String(data.titleSource)) } : null,
    spawnedFromLocalId,
  };
}

// Parsed files by path, re-read only when their mtime changes: a rebuild is a
// directory walk plus one stat per file.
const fileCache = new Map<string, { mtimeMs: number; parsed: DesktopSessionFile | null }>();

async function readSessionFile(filePath: string): Promise<ReadSessionFile | null> {
  try {
    const { mtimeMs } = await stat(filePath);
    const cached = fileCache.get(filePath);
    if (cached && cached.mtimeMs === mtimeMs) {
      return cached.parsed ? { mtimeMs, parsed: cached.parsed } : null;
    }
    const parsed = parseSessionFile(filePath, await readFile(filePath, 'utf8'));
    fileCache.set(filePath, { mtimeMs, parsed });
    return parsed ? { mtimeMs, parsed } : null;
  } catch {
    // A file the app is rewriting right now is skipped until the next rebuild.
    return null;
  }
}

/**
 * Merges the session files of every directory: the newest file wins for a
 * session id, and a child links to its parent only when the parent's file is
 * there to say which Claude Code session it is.
 */
export function buildDesktopIndex(files: ReadSessionFile[]): DesktopIndex {
  const newestFirst = [...files].sort((left, right) => right.mtimeMs - left.mtimeMs);
  const byCliSessionId = new Map<string, DesktopSessionFile>();
  const cliSessionIdByLocalId = new Map<string, string>();

  for (const { parsed } of newestFirst) {
    if (!byCliSessionId.has(parsed.cliSessionId)) {
      byCliSessionId.set(parsed.cliSessionId, parsed);
    }
    if (!cliSessionIdByLocalId.has(parsed.localSessionId)) {
      cliSessionIdByLocalId.set(parsed.localSessionId, parsed.cliSessionId);
    }
  }

  const titles = new Map<string, DesktopSessionTitle>();
  const parents = new Map<string, string>();
  for (const [cliSessionId, session] of byCliSessionId) {
    if (session.title) {
      titles.set(cliSessionId, session.title);
    }
    const parentCliSessionId = session.spawnedFromLocalId
      ? cliSessionIdByLocalId.get(session.spawnedFromLocalId)
      : undefined;
    if (parentCliSessionId && parentCliSessionId !== cliSessionId) {
      parents.set(cliSessionId, parentCliSessionId);
    }
  }

  return { titles, parents };
}

async function buildIndex(): Promise<DesktopIndex> {
  const directories = await resolveDesktopSessionsDirectories();
  const files = (await Promise.all(
    directories.map((directory) => listSessionFiles(directory, ACCOUNT_DIRECTORY_DEPTH)),
  )).flat();

  const present = new Set(files);
  for (const cachedPath of fileCache.keys()) {
    if (!present.has(cachedPath)) {
      fileCache.delete(cachedPath);
    }
  }

  const entries = await Promise.all(files.map(readSessionFile));
  return buildDesktopIndex(entries.filter((entry): entry is ReadSessionFile => entry !== null));
}

let cachedIndex: DesktopIndex | null = null;
let cachedAt = 0;
let pendingIndex: Promise<DesktopIndex> | null = null;

async function getIndex(): Promise<DesktopIndex> {
  if (cachedIndex && Date.now() - cachedAt < INDEX_TTL_MS) {
    return cachedIndex;
  }
  if (!pendingIndex) {
    pendingIndex = buildIndex()
      .then((index) => {
        cachedIndex = index;
        cachedAt = Date.now();
        return index;
      })
      .finally(() => {
        pendingIndex = null;
      });
  }
  return pendingIndex;
}

/** @internal For tests, which point the module at a temp directory between cases. */
export function resetDesktopIndexCache(): void {
  cachedIndex = null;
  cachedAt = 0;
  fileCache.clear();
}

/** The desktop app's title for a Claude Code session id, when the session was started or titled there. */
export async function getDesktopSessionTitle(cliSessionId: string): Promise<DesktopSessionTitle | null> {
  const index = await getIndex();
  return index.titles.get(cliSessionId) ?? null;
}

/**
 * Child → parent Claude Code session ids, for the sessions the desktop app
 * spawned from another one (task chips).
 */
export async function getDesktopParentSessionIds(): Promise<ReadonlyMap<string, string>> {
  const index = await getIndex();
  return index.parents;
}
