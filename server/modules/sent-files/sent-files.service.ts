import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { appConfigDb, userDb } from '@/modules/database/index.js';
import { createNotificationEvent, notifyUserIfEnabled } from '@/modules/notifications/index.js';
import { providerMcpService } from '@/modules/providers/index.js';
import { connectedClients, WS_OPEN_STATE } from '@/modules/websocket/index.js';
import { AppError, getModuleDirectory } from '@/shared/utils.js';

/**
 * "Send file to the user" for agent sessions run through CloudCLI.
 *
 * The Claude desktop app offers a SendUserFile tool that only exists inside
 * that app. This module gives agents the same capability here: an MCP tool
 * hands over local files, which are copied into a private store (so the user
 * sees the file exactly as it was when sent), announced to open clients over
 * the websocket and, on request, through a push notification.
 */

const __dirname = getModuleDirectory(import.meta.url);

export const SENT_FILES_MCP_SERVER_NAME = 'cloudcli-send-file';
export const SENT_FILES_MCP_TOOL_NAME = 'send_user_file';
const MCP_TOKEN_KEY = 'sent_files_mcp_token';
const STORE_ROOT = process.env.CLOUDCLI_SENT_FILES_DIR || path.join(os.homedir(), '.cloudcli', 'sent-files');
const METADATA_FILE_NAME = 'meta.json';
const MAX_FILES_PER_CALL = 20;
const MAX_FILE_BYTES = Number.parseInt(process.env.CLOUDCLI_SENT_FILES_MAX_BYTES || String(50 * 1024 * 1024), 10);
const MAX_CAPTION_LENGTH = 500;
const SENT_FILE_ID_PATTERN = /^[0-9a-f-]{36}$/;

const MIME_BY_EXTENSION: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  md: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  csv: 'text/csv',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

export type SentFile = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  caption: string | null;
  sourcePath: string;
  sentAt: string;
};

type SendFilesInput = {
  paths: string[];
  caption?: string | null;
  notify?: boolean;
};

const mimeTypeFor = (fileName: string): string =>
  MIME_BY_EXTENSION[path.extname(fileName).slice(1).toLowerCase()] ?? 'application/octet-stream';

const entryDirectory = (id: string) => path.join(STORE_ROOT, id);

function assertSentFileId(id: string): void {
  // The id becomes a directory name: anything but a UUID could escape the store.
  if (!SENT_FILE_ID_PATTERN.test(id)) {
    throw new AppError('Sent file not found.', { code: 'SENT_FILE_NOT_FOUND', statusCode: 404 });
  }
}

function resolveSourceFile(rawPath: string): { absolutePath: string; size: number } {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    throw new AppError('Each file path must be a non-empty string.', { code: 'SENT_FILE_INVALID_PATH', statusCode: 400 });
  }
  if (!path.isAbsolute(rawPath.trim())) {
    throw new AppError(`File path must be absolute: ${rawPath}`, { code: 'SENT_FILE_INVALID_PATH', statusCode: 400 });
  }
  const absolutePath = path.resolve(rawPath.trim());
  const stats = fs.statSync(absolutePath, { throwIfNoEntry: false });
  if (!stats?.isFile()) {
    throw new AppError(`Not a file: ${absolutePath}`, { code: 'SENT_FILE_NOT_A_FILE', statusCode: 400 });
  }
  if (stats.size > MAX_FILE_BYTES) {
    throw new AppError(`File larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB: ${absolutePath}`, {
      code: 'SENT_FILE_TOO_LARGE',
      statusCode: 413,
    });
  }
  return { absolutePath, size: stats.size };
}

function storeFile(source: { absolutePath: string; size: number }, caption: string | null): SentFile {
  const id = randomUUID();
  const name = path.basename(source.absolutePath);
  const directory = entryDirectory(id);
  fs.mkdirSync(directory, { recursive: true });
  fs.copyFileSync(source.absolutePath, path.join(directory, name));

  const sentFile: SentFile = {
    id,
    name,
    size: source.size,
    mimeType: mimeTypeFor(name),
    caption,
    sourcePath: source.absolutePath,
    sentAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(directory, METADATA_FILE_NAME), JSON.stringify(sentFile, null, 2), 'utf8');
  return sentFile;
}

function broadcastSentFiles(files: SentFile[]): void {
  const payload = JSON.stringify({ kind: 'sent_files', files, timestamp: new Date().toISOString() });
  connectedClients.forEach((client) => {
    if (client.readyState === WS_OPEN_STATE) {
      client.send(payload);
    }
  });
}

function notifyOwner(files: SentFile[], caption: string | null): void {
  // CloudCLI is single-user: the owner is the only possible recipient.
  const owner = userDb.getFirstUser();
  if (!owner) {
    return;
  }
  const names = files.map((file) => file.name).join(', ');
  const event = createNotificationEvent({
    provider: 'claude',
    code: 'agent.notification',
    meta: { message: caption ? `${names} — ${caption}` : names },
  });
  // Without a per-batch key, two sends within the dedupe window would collapse
  // into one notification (the default key ignores the message).
  notifyUserIfEnabled({ userId: owner.id, event: { ...event, dedupeKey: `sent-files:${files[0]?.id ?? 'none'}` } });
}

function getOrCreateMcpToken(): string {
  const existing = appConfigDb.get(MCP_TOKEN_KEY);
  if (existing) {
    return existing;
  }
  const token = randomBytes(32).toString('hex');
  appConfigDb.set(MCP_TOKEN_KEY, token);
  return token;
}

export const sentFilesService = {
  sendFiles({ paths, caption = null, notify = false }: SendFilesInput): SentFile[] {
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new AppError('At least one file path is required.', { code: 'SENT_FILE_NO_FILES', statusCode: 400 });
    }
    if (paths.length > MAX_FILES_PER_CALL) {
      throw new AppError(`At most ${MAX_FILES_PER_CALL} files per call.`, { code: 'SENT_FILE_TOO_MANY', statusCode: 400 });
    }
    const normalizedCaption = typeof caption === 'string' && caption.trim()
      ? caption.trim().slice(0, MAX_CAPTION_LENGTH)
      : null;

    // Validate every path before copying anything, so a bad path in the list
    // never leaves half of the batch announced.
    const sources = paths.map(resolveSourceFile);
    const files = sources.map((source) => storeFile(source, normalizedCaption));

    broadcastSentFiles(files);
    if (notify) {
      notifyOwner(files, normalizedCaption);
    }
    return files;
  },

  getSentFile(id: string): SentFile {
    assertSentFileId(id);
    const metadataPath = path.join(entryDirectory(id), METADATA_FILE_NAME);
    if (!fs.existsSync(metadataPath)) {
      throw new AppError('Sent file not found.', { code: 'SENT_FILE_NOT_FOUND', statusCode: 404 });
    }
    return JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as SentFile;
  },

  getSentFileContentPath(id: string): string {
    const sentFile = this.getSentFile(id);
    return path.join(entryDirectory(id), sentFile.name);
  },

  getMcpToken(): string {
    return getOrCreateMcpToken();
  },

  /** Registers the stdio MCP server for Claude Code at user scope, so every session started by CloudCLI can send files. */
  async registerAgentMcp(): Promise<void> {
    const port = process.env.SERVER_PORT || process.env.PORT || '3001';
    await providerMcpService.upsertProviderMcpServer('claude', {
      name: SENT_FILES_MCP_SERVER_NAME,
      scope: 'user',
      transport: 'stdio',
      command: process.execPath,
      args: [path.join(__dirname, 'sent-files-mcp.js')],
      env: {
        CLOUDCLI_SENT_FILES_MCP_TOKEN: getOrCreateMcpToken(),
        CLOUDCLI_SENT_FILES_API_URL: `http://127.0.0.1:${port}/api/sent-files-mcp`,
      },
    });
  },
};
