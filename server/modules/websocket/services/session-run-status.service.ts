import { notificationPreferencesDb, sessionsDb } from '@/modules/database/index.js';
import { viewerPresence } from '@/modules/websocket/services/viewer-presence.service.js';
import { connectedClients, WS_OPEN_STATE } from '@/modules/websocket/services/websocket-state.service.js';

type SessionRow = NonNullable<ReturnType<typeof sessionsDb.getSessionById>>;

/** The flags a sidebar action may change. Omitted keys stay as they are. */
type SessionStatusPatch = {
  isPinned?: boolean;
  isUnread?: boolean;
  isCompleted?: boolean;
};

/**
 * The `session_status` frame. Carries the full flag set, so a client applies it
 * without knowing what it had before.
 *
 * `finishedUnseen` is set only on the frame announcing that a run just ended
 * with nobody watching; the client shows its "finished" toast for it, and only
 * when `notify` says the user has not turned completion notifications off.
 */
type SessionStatusEvent = {
  kind: 'session_status';
  sessionId: string;
  provider: string;
  sessionTitle: string;
  isPinned: boolean;
  isUnread: boolean;
  isCompleted: boolean;
  finishedUnseen?: boolean;
  notify?: boolean;
  timestamp: string;
};

/** The flags as the API and the realtime frame expose them. */
export type SessionStatusFlags = Pick<SessionStatusEvent, 'sessionId' | 'isPinned' | 'isUnread' | 'isCompleted'>;

function toFlags(row: SessionRow): SessionStatusFlags {
  return {
    sessionId: row.session_id,
    isPinned: Boolean(row.isPinned),
    isUnread: Boolean(row.isUnread),
    isCompleted: Boolean(row.isCompleted),
  };
}

function broadcastSessionStatus(row: SessionRow, extra: Pick<SessionStatusEvent, 'finishedUnseen' | 'notify'> = {}): void {
  const event: SessionStatusEvent = {
    kind: 'session_status',
    ...toFlags(row),
    provider: row.provider,
    sessionTitle: row.custom_name?.trim() || '',
    ...extra,
    timestamp: new Date().toISOString(),
  };
  const payload = JSON.stringify(event);
  connectedClients.forEach((client) => {
    if (client.readyState === WS_OPEN_STATE) {
      client.send(payload);
    }
  });
}

// The toast follows the same "run stopped" preference as push and desktop
// notifications, so turning those off silences every completion signal.
function isCompletionNotificationEnabled(userId: string | number | null): boolean {
  const numericUserId = Number(userId);
  if (userId === null || !Number.isInteger(numericUserId)) {
    return true;
  }
  // The lookup creates the defaults on first read, which can fail for a user
  // row that is gone; the unread mark must still go out.
  try {
    return notificationPreferencesDb.getPreferences(numericUserId).events.stop;
  } catch (error) {
    console.error('[SessionRunStatus] Could not read notification preferences:', error);
    return true;
  }
}

/**
 * Owns the sidebar status flags of a session (pinned, unread, completed): the
 * user's own changes through the API, and the automatic ones a run makes.
 *
 * Every change is broadcast to all tabs as one `session_status` frame. A
 * `session_upserted` is deliberately not reused: clients treat that as
 * activity, and pinning a session is not activity.
 */
export const sessionRunStatus = {
  /**
   * Applies a user's change and broadcasts it. Used by the providers module's
   * sessions service behind `PATCH /api/providers/sessions/:id/status`.
   * Returns null when the session does not exist.
   */
  setStatus(sessionId: string, patch: SessionStatusPatch): SessionStatusFlags | null {
    const row = sessionsDb.updateSessionStatus(sessionId, patch);
    if (!row) {
      return null;
    }
    broadcastSessionStatus(row);
    return toFlags(row);
  },

  /**
   * A new run reopens a session marked completed: the user is working on it
   * again. Installed as the run registry's start listener.
   */
  handleRunStarted(sessionId: string): void {
    const row = sessionsDb.getSessionById(sessionId);
    if (!row?.isCompleted) {
      return;
    }
    const updated = sessionsDb.updateSessionStatus(sessionId, { isCompleted: false });
    if (updated) {
      broadcastSessionStatus(updated);
    }
  },

  /**
   * A run that ends while no visible tab shows its session leaves the session
   * unread. Installed as the run registry's completion listener.
   */
  handleRunCompleted(sessionId: string, userId: string | number | null): void {
    if (viewerPresence.isSessionViewed(sessionId, userId)) {
      return;
    }
    const updated = sessionsDb.updateSessionStatus(sessionId, { isUnread: true });
    if (!updated) {
      return;
    }
    broadcastSessionStatus(updated, {
      finishedUnseen: true,
      notify: isCompletionNotificationEnabled(userId),
    });
  },

  /** Opening a session in a visible tab reads it. Called on each presence report. */
  markViewedSessionsRead(sessionIds: string[]): void {
    for (const sessionId of sessionIds) {
      const row = sessionsDb.getSessionById(sessionId);
      if (!row?.isUnread) {
        continue;
      }
      const updated = sessionsDb.updateSessionStatus(sessionId, { isUnread: false });
      if (updated) {
        broadcastSessionStatus(updated);
      }
    }
  },
};
