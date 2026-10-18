import type { WebSocket } from 'ws';

import { sessionsDb } from '@/modules/database/index.js';
import { startClaudeSideChat, type ClaudeSideChat, type SideChatEvent } from '@/modules/providers/index.js';
import type { AnyRecord } from '@/shared/types.js';

/**
 * Side chats keyed by the client's id, each tied to the socket that opened it.
 *
 * A side chat is ephemeral by design: closing the panel, losing the socket or
 * leaving it idle ends its process, and with it the only copy of the side
 * conversation (the fork is never written to disk).
 */

// A forgotten side chat still holds a CLI process; this frees it.
const SIDE_CHAT_IDLE_MS = 15 * 60 * 1000;
const MAX_QUESTION_LENGTH = 20000;
const MAX_SIDE_CHATS_PER_SOCKET = 3;

const WS_OPEN_STATE = 1;

type SideChatEntry = {
  ws: WebSocket;
  sessionId: string;
  chat: ClaudeSideChat;
  idleTimer: ReturnType<typeof setTimeout> | null;
};

export type SideChatDependencies = {
  getSession?: (sessionId: string) => ReturnType<typeof sessionsDb.getSessionById>;
  start?: typeof startClaudeSideChat;
};

const sideChats = new Map<string, SideChatEntry>();

function send(ws: WebSocket, sideChatId: string, payload: SideChatEvent | { event: 'error'; error: string; code: string }): void {
  if (ws.readyState === WS_OPEN_STATE) {
    // No `sessionId` on purpose: the chat's realtime handler routes frames by
    // it, and a side answer must never land in the main transcript.
    ws.send(JSON.stringify({ kind: 'side_chat', sideChatId, ...payload }));
  }
}

function sendError(ws: WebSocket, sideChatId: string, code: string, error: string): void {
  send(ws, sideChatId, { event: 'error', code, error });
}

function touch(sideChatId: string, entry: SideChatEntry): void {
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
  }
  entry.idleTimer = setTimeout(() => closeSideChat(sideChatId), SIDE_CHAT_IDLE_MS);
  entry.idleTimer.unref?.();
}

function closeSideChat(sideChatId: string): void {
  const entry = sideChats.get(sideChatId);
  if (!entry) {
    return;
  }
  sideChats.delete(sideChatId);
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
  }
  entry.chat.close();
}

function readString(data: AnyRecord, key: string): string {
  return typeof data[key] === 'string' ? (data[key] as string).trim() : '';
}

function openSideChat(
  ws: WebSocket,
  sideChatId: string,
  sessionId: string,
  dependencies: SideChatDependencies,
): SideChatEntry | null {
  const session = (dependencies.getSession ?? sessionsDb.getSessionById.bind(sessionsDb))(sessionId);
  if (!session) {
    sendError(ws, sideChatId, 'SESSION_NOT_FOUND', `Session "${sessionId}" was not found.`);
    return null;
  }
  if (session.provider !== 'claude') {
    sendError(ws, sideChatId, 'UNSUPPORTED_PROVIDER', 'Side chats are available for Claude sessions only.');
    return null;
  }
  if (!session.provider_session_id) {
    sendError(ws, sideChatId, 'SESSION_NOT_READY', 'This session has no conversation yet.');
    return null;
  }
  const openOnSocket = [...sideChats.values()].filter((entry) => entry.ws === ws).length;
  if (openOnSocket >= MAX_SIDE_CHATS_PER_SOCKET) {
    sendError(ws, sideChatId, 'TOO_MANY_SIDE_CHATS', 'Close another side chat first.');
    return null;
  }

  const start = dependencies.start ?? startClaudeSideChat;
  const chat = start({
    providerSessionId: session.provider_session_id,
    cwd: session.project_path ?? process.cwd(),
    model: session.model,
    onEvent: (event) => {
      const entry = sideChats.get(sideChatId);
      if (entry) {
        touch(sideChatId, entry);
      }
      send(ws, sideChatId, event);
    },
  });
  const entry: SideChatEntry = { ws, sessionId, chat, idleTimer: null };
  sideChats.set(sideChatId, entry);
  return entry;
}

export const sideChatService = {
  /** `chat.side-question`: opens the side chat on its first question, then keeps asking the same process. */
  ask(ws: WebSocket, data: AnyRecord, dependencies: SideChatDependencies = {}): void {
    const sideChatId = readString(data, 'sideChatId');
    const sessionId = readString(data, 'sessionId');
    const text = readString(data, 'text');
    if (!sideChatId) {
      return;
    }
    if (!text || text.length > MAX_QUESTION_LENGTH) {
      sendError(ws, sideChatId, 'INVALID_QUESTION', 'The question is empty or too long.');
      return;
    }

    let entry = sideChats.get(sideChatId);
    if (entry && (entry.ws !== ws || entry.sessionId !== sessionId)) {
      // Ids come from the client: one socket cannot drive another's side chat.
      sendError(ws, sideChatId, 'SIDE_CHAT_MISMATCH', 'This side chat belongs to another session.');
      return;
    }
    if (!entry) {
      if (!sessionId) {
        sendError(ws, sideChatId, 'SESSION_ID_REQUIRED', 'A side chat needs a session.');
        return;
      }
      entry = openSideChat(ws, sideChatId, sessionId, dependencies) ?? undefined;
      if (!entry) {
        return;
      }
    }
    touch(sideChatId, entry);
    if (!entry.chat.ask(text)) {
      closeSideChat(sideChatId);
      sendError(ws, sideChatId, 'SIDE_CHAT_CLOSED', 'The side chat has ended. Open a new one.');
    }
  },

  /** `chat.side-close`: the panel was closed, so the side conversation is discarded. */
  close(ws: WebSocket, data: AnyRecord): void {
    const sideChatId = readString(data, 'sideChatId');
    if (sideChats.get(sideChatId)?.ws === ws) {
      closeSideChat(sideChatId);
    }
  },

  /** The socket went away: nobody can read the answers any more. */
  closeAllFor(ws: WebSocket): void {
    for (const [sideChatId, entry] of [...sideChats.entries()]) {
      if (entry.ws === ws) {
        closeSideChat(sideChatId);
      }
    }
  },

  /** For tests. */
  count(): number {
    return sideChats.size;
  },
};
