import { useEffect, useMemo, useState } from 'react';

import type { ServerEvent } from '@/shared/types';

// Events after which a session can no longer be sitting on an open prompt.
const RUN_END_KINDS = new Set(['complete', 'stream_end']);

type OpenRequests = ReadonlyMap<string, ReadonlySet<string>>;

function readRequestIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
}

function withSessionRequests(previous: OpenRequests, sessionId: string, requestIds: string[]): OpenRequests {
  if (requestIds.length === 0 && !previous.has(sessionId)) {
    return previous;
  }
  const next = new Map(previous);
  if (requestIds.length === 0) {
    next.delete(sessionId);
  } else {
    next.set(sessionId, new Set(requestIds));
  }
  return next;
}

/**
 * The sessions with a permission, question or plan prompt open.
 *
 * Two sources. The server's `session_waiting` frames (and the snapshot it
 * sends on connect) cover every session, including ones this tab never
 * subscribed to, and say when the wait ends. The run's own
 * `permission_request` / `permission_resolved` / `permission_cancelled`
 * events cover the sessions this tab watches; those count only while the
 * session is busy, so a run that ended while the socket was down cannot leave
 * a hand on its row forever.
 */
export function useWaitingSessionIds(
  subscribe: (listener: (event: ServerEvent) => void) => () => void,
  activeSessions: ReadonlySet<string>,
): ReadonlySet<string> {
  // Open prompt request ids per session: a run can ask more than once before any answer arrives.
  const [openRequestsBySession, setOpenRequestsBySession] = useState<OpenRequests>(new Map());
  const [serverWaiting, setServerWaiting] = useState<OpenRequests>(new Map());

  useEffect(() => subscribe((event: ServerEvent) => {
    // Whatever closed while the socket was down went unheard; the server sends
    // a fresh snapshot after connecting when anything still waits.
    if (event.kind === 'websocket_reconnected') {
      setServerWaiting((previous) => (previous.size === 0 ? previous : new Map()));
      return;
    }
    if (event.kind === 'sessions_waiting_snapshot') {
      const sessions = Array.isArray(event.sessions) ? event.sessions : [];
      const next = new Map<string, ReadonlySet<string>>();
      for (const entry of sessions) {
        const record = entry as { sessionId?: unknown; requestIds?: unknown };
        const requestIds = readRequestIds(record?.requestIds);
        if (typeof record?.sessionId === 'string' && requestIds.length > 0) {
          next.set(record.sessionId, new Set(requestIds));
        }
      }
      setServerWaiting(next);
      return;
    }

    const sessionId = typeof event.sessionId === 'string' ? event.sessionId : null;
    if (!sessionId) {
      return;
    }

    if (event.kind === 'session_waiting') {
      const requestIds = readRequestIds(event.requestIds);
      setServerWaiting((previous) => withSessionRequests(previous, sessionId, requestIds));
      return;
    }

    const requestId = typeof event.requestId === 'string' ? event.requestId : null;

    if (event.kind === 'permission_request' && requestId) {
      setOpenRequestsBySession((previous) => {
        if (previous.get(sessionId)?.has(requestId)) {
          return previous;
        }
        return withSessionRequests(previous, sessionId, [...(previous.get(sessionId) ?? []), requestId]);
      });
      return;
    }

    const closesOne = (event.kind === 'permission_resolved' || event.kind === 'permission_cancelled') && requestId;
    const closesAll = RUN_END_KINDS.has(String(event.kind));
    if (!closesOne && !closesAll) {
      return;
    }

    const close = (previous: OpenRequests): OpenRequests => {
      const open = previous.get(sessionId);
      if (!open) {
        return previous;
      }
      const remaining = closesAll ? [] : [...open].filter((id) => id !== requestId);
      return remaining.length === open.size ? previous : withSessionRequests(previous, sessionId, remaining);
    };
    setOpenRequestsBySession(close);
    setServerWaiting(close);
  }), [subscribe]);

  return useMemo(() => {
    const waiting = new Set<string>(serverWaiting.keys());
    for (const sessionId of openRequestsBySession.keys()) {
      if (activeSessions.has(sessionId)) {
        waiting.add(sessionId);
      }
    }
    return waiting;
  }, [activeSessions, openRequestsBySession, serverWaiting]);
}
