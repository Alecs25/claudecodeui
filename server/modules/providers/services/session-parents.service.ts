import { sessionsDb } from '@/modules/database/index.js';
import { getDesktopParentSessionIds } from '@/modules/providers/list/claude/claude-desktop-titles.js';

/** The columns of a session row the parent lookup needs. */
export type SessionParentLookupRow = {
  session_id: string;
  provider: string;
  provider_session_id?: string | null;
};

/** Returns the app session id of a row's parent, or null when it has none the app knows. */
export type SessionParentResolver = (row: SessionParentLookupRow) => string | null;

/**
 * Builds a resolver from the parent links the Claude desktop app records for
 * sessions spawned from another one.
 *
 * The links are between Claude Code ids (the transcript's session id, which
 * CloudCLI keeps as `provider_session_id`); the client only knows app session
 * ids, so the parent is mapped through its own row. A parent CloudCLI has not
 * indexed, or has archived, leaves the child unparented.
 */
export function createSessionParentResolver(parentsByCliSessionId: ReadonlyMap<string, string>): SessionParentResolver {
  const parentAppIdByCliSessionId = new Map<string, string | null>();

  return (row) => {
    if (row.provider !== 'claude' || parentsByCliSessionId.size === 0) {
      return null;
    }
    const parentCliSessionId = parentsByCliSessionId.get(row.provider_session_id || row.session_id);
    if (!parentCliSessionId) {
      return null;
    }

    if (!parentAppIdByCliSessionId.has(parentCliSessionId)) {
      const parentRow = sessionsDb.getSessionByProviderSessionId(parentCliSessionId)
        ?? sessionsDb.getSessionById(parentCliSessionId);
      const parentAppId = parentRow && !parentRow.isArchived ? parentRow.session_id : null;
      parentAppIdByCliSessionId.set(parentCliSessionId, parentAppId);
    }

    const parentAppId = parentAppIdByCliSessionId.get(parentCliSessionId) ?? null;
    return parentAppId === row.session_id ? null : parentAppId;
  };
}

/** A resolver over the desktop app's current parent links (cached for a few seconds). */
export async function loadSessionParentResolver(): Promise<SessionParentResolver> {
  try {
    return createSessionParentResolver(await getDesktopParentSessionIds());
  } catch (error) {
    // Nesting is cosmetic: without the desktop metadata every session stays top level.
    console.warn('Could not read the Claude desktop app session links', { error: (error as Error).message });
    return createSessionParentResolver(new Map());
  }
}
