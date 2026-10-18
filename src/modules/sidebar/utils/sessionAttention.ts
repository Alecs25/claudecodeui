import type { Project } from '@/shared/types';
import { getAllSessions } from '@/modules/sidebar/utils/sidebarProjectFormatting';

type SessionAttentionInput = {
  projects: Project[];
  waitingSessionIds: ReadonlySet<string>;
  attentionSessionIds: ReadonlySet<string>;
  /** The session on screen: already being looked at, so it never counts as unread. */
  selectedSessionId: string | null;
};

/**
 * Whether the rail's Sessions icon gets its dot: a session waits for a
 * permission answer, or is unread, by the same rules as the row's unread mark.
 */
export function hasSessionsNeedingAttention({
  projects,
  waitingSessionIds,
  attentionSessionIds,
  selectedSessionId,
}: SessionAttentionInput): boolean {
  if (waitingSessionIds.size > 0) {
    return true;
  }
  for (const sessionId of attentionSessionIds) {
    if (sessionId !== selectedSessionId) {
      return true;
    }
  }
  return projects.some((project) => getAllSessions(project).some(
    (session) => Boolean(session.isUnread) && session.id !== selectedSessionId,
  ));
}
