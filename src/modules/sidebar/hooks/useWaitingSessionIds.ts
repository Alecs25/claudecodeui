import { useEffect, useMemo, useState } from 'react';

import type { ServerEvent } from '@/shared/types';

// Events after which a session can no longer be sitting on an open prompt.
const RUN_END_KINDS = new Set(['complete', 'stream_end']);

/**
 * The sessions with a permission or question prompt open, as far as this tab
 * has heard: a `permission_request` opens one, its `permission_resolved` /
 * `permission_cancelled` (from any tab) or the end of the run closes it.
 *
 * A session that stops being busy drops out too, so a run that ended while the
 * socket was down cannot leave a hand on its row forever.
 */
export function useWaitingSessionIds(
  subscribe: (listener: (event: ServerEvent) => void) => () => void,
  activeSessions: ReadonlySet<string>,
): ReadonlySet<string> {
  // Open prompt request ids per session: a run can ask more than once before any answer arrives.
  const [openRequestsBySession, setOpenRequestsBySession] = useState<ReadonlyMap<string, ReadonlySet<string>>>(new Map());

  useEffect(() => subscribe((event: ServerEvent) => {
    const sessionId = typeof event.sessionId === 'string' ? event.sessionId : null;
    if (!sessionId) {
      return;
    }
    const requestId = typeof event.requestId === 'string' ? event.requestId : null;

    if (event.kind === 'permission_request' && requestId) {
      setOpenRequestsBySession((previous) => {
        if (previous.get(sessionId)?.has(requestId)) {
          return previous;
        }
        const next = new Map(previous);
        next.set(sessionId, new Set([...(previous.get(sessionId) ?? []), requestId]));
        return next;
      });
      return;
    }

    const closesOne = (event.kind === 'permission_resolved' || event.kind === 'permission_cancelled') && requestId;
    const closesAll = RUN_END_KINDS.has(String(event.kind));
    if (!closesOne && !closesAll) {
      return;
    }

    setOpenRequestsBySession((previous) => {
      const open = previous.get(sessionId);
      if (!open) {
        return previous;
      }
      const remaining = closesAll ? [] : [...open].filter((id) => id !== requestId);
      if (remaining.length === open.size) {
        return previous;
      }
      const next = new Map(previous);
      if (remaining.length === 0) {
        next.delete(sessionId);
      } else {
        next.set(sessionId, new Set(remaining));
      }
      return next;
    });
  }), [subscribe]);

  return useMemo(() => {
    const waiting = new Set<string>();
    for (const sessionId of openRequestsBySession.keys()) {
      if (activeSessions.has(sessionId)) {
        waiting.add(sessionId);
      }
    }
    return waiting;
  }, [activeSessions, openRequestsBySession]);
}
