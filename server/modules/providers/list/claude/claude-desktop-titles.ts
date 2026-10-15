import os from 'node:os';
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';

/**
 * Session titles from the Claude desktop app.
 *
 * The desktop app keeps its titles (the ones the user types in its sidebar, or
 * the ones it generates) in its own metadata, one `local_<id>.json` per session
 * under `claude-code-sessions/<account>/<org>/`, never in the transcript. CloudCLI
 * reads the transcript, so without this a session renamed "HT \ CLOUDCLI" in the
 * app shows up here under Claude Code's own summary.
 */

export type DesktopSessionTitle = {
  title: string;
  /**
   * True when the title was chosen — typed by the user in the app ('user') or
   * set by the agent's session-title tool ('tool') — rather than generated.
   */
  isChosenTitle: boolean;
};

const SESSIONS_DIRECTORY_NAME = 'claude-code-sessions';
const CHOSEN_TITLE_SOURCES = new Set(['user', 'tool']);
const SESSION_FILE_PATTERN = /^local_[0-9a-f-]+\.json$/i;
// synchronizeFile runs on every transcript write while a session streams; the
// index is a directory walk, so it is rebuilt at most this often.
const INDEX_TTL_MS = 10_000;
const ACCOUNT_DIRECTORY_DEPTH = 2;

function getDesktopAppDataDirectory(): string {
  if (process.env.CLOUDCLI_CLAUDE_DESKTOP_DIR) {
    return process.env.CLOUDCLI_CLAUDE_DESKTOP_DIR;
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Claude');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Claude');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'Claude');
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

async function readSessionTitle(filePath: string): Promise<[string, DesktopSessionTitle] | null> {
  try {
    const data = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
    const cliSessionId = typeof data.cliSessionId === 'string' ? data.cliSessionId : '';
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    if (!cliSessionId || !title) {
      return null;
    }
    return [cliSessionId, { title, isChosenTitle: CHOSEN_TITLE_SOURCES.has(String(data.titleSource)) }];
  } catch {
    // A file the app is rewriting right now is skipped until the next rebuild.
    return null;
  }
}

async function buildIndex(): Promise<Map<string, DesktopSessionTitle>> {
  const root = path.join(getDesktopAppDataDirectory(), SESSIONS_DIRECTORY_NAME);
  const files = await listSessionFiles(root, ACCOUNT_DIRECTORY_DEPTH);
  const entries = await Promise.all(files.map(readSessionTitle));
  return new Map(entries.filter((entry): entry is [string, DesktopSessionTitle] => entry !== null));
}

let cachedIndex: Map<string, DesktopSessionTitle> | null = null;
let cachedAt = 0;
let pendingIndex: Promise<Map<string, DesktopSessionTitle>> | null = null;

async function getIndex(): Promise<Map<string, DesktopSessionTitle>> {
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

/** The desktop app's title for a Claude Code session id, when the session was started or titled there. */
export async function getDesktopSessionTitle(cliSessionId: string): Promise<DesktopSessionTitle | null> {
  const index = await getIndex();
  return index.get(cliSessionId) ?? null;
}
