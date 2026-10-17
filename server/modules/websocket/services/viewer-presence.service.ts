import type { RealtimeClientConnection } from '@/shared/types.js';

/**
 * What one browser tab reports about itself over its chat socket: the
 * sessions on screen (two in split view) and whether the tab is visible.
 */
type ViewerPresence = {
  userId: string | number | null;
  sessionIds: string[];
  visible: boolean;
};

/**
 * Presence per open chat socket. In memory only: a socket that goes away takes
 * its presence with it, and after a server restart every tab reports again on
 * reconnect.
 */
const presenceByConnection = new Map<RealtimeClientConnection, ViewerPresence>();

/**
 * Which sessions are on screen in a visible tab right now.
 *
 * Consulted when a run ends, by the unread marker and by the notification
 * orchestrator (wired in the server entrypoint), so neither flags nor
 * announces a finish the user just watched happen.
 */
export const viewerPresence = {
  update(connection: RealtimeClientConnection, presence: ViewerPresence): void {
    presenceByConnection.set(connection, {
      ...presence,
      sessionIds: [...new Set(presence.sessionIds)],
    });
  },

  remove(connection: RealtimeClientConnection): void {
    presenceByConnection.delete(connection);
  },

  /**
   * True when some visible tab shows the session. With a user id, only that
   * user's tabs count; tabs whose socket carried no user (platform mode) match
   * any user, since platform mode is single-user.
   */
  isSessionViewed(sessionId: string, userId: string | number | null = null): boolean {
    for (const presence of presenceByConnection.values()) {
      if (!presence.visible || !presence.sessionIds.includes(sessionId)) {
        continue;
      }
      if (userId === null || presence.userId === null || String(presence.userId) === String(userId)) {
        return true;
      }
    }
    return false;
  },

  /** Test-only escape hatch: forgets every connection. */
  clearAll(): void {
    presenceByConnection.clear();
  },
};
