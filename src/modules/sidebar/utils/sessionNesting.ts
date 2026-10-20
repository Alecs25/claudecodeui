import type { SessionWithProvider } from '@/shared/types';
import { getSessionDate } from '@/modules/sidebar/utils/sidebarProjectFormatting';

export type NestedSessions = {
  /** Rows without a parent in the list, in the list's order. */
  roots: SessionWithProvider[];
  /** Children of each shown parent, most recent first. */
  childrenByParentId: ReadonlyMap<string, SessionWithProvider[]>;
  /** Every session id under a root, mapped to that root's id (roots map to themselves). */
  rootIdBySessionId: ReadonlyMap<string, string>;
  /** Each nested child's parent id. */
  parentIdBySessionId: ReadonlyMap<string, string>;
};

const COLLAPSED_PARENTS_STORAGE_KEY = 'sidebarCollapsedSessionParents';

/**
 * Nests sessions the Claude desktop app spawned from another one under their
 * parent, as the app's own sidebar does. A child whose parent is not in this
 * list (another project, the pinned section, not loaded yet) stays a root, and
 * so does any row of a parent chain that loops back on itself.
 */
export function nestChildSessions(sessions: SessionWithProvider[]): NestedSessions {
  const byId = new Map(sessions.map((session) => [session.id, session]));

  const findParentId = (session: SessionWithProvider): string | null => {
    const parentId = session.parentSessionId;
    return parentId && parentId !== session.id && byId.has(parentId) ? parentId : null;
  };

  const isInCycle = (session: SessionWithProvider): boolean => {
    const visited = new Set<string>([session.id]);
    let parentId = findParentId(session);
    while (parentId) {
      if (visited.has(parentId)) {
        return true;
      }
      visited.add(parentId);
      parentId = findParentId(byId.get(parentId) as SessionWithProvider);
    }
    return false;
  };

  const roots: SessionWithProvider[] = [];
  const childrenByParentId = new Map<string, SessionWithProvider[]>();
  const parentIdBySessionId = new Map<string, string>();
  for (const session of sessions) {
    const parentId = findParentId(session);
    if (!parentId || isInCycle(session)) {
      roots.push(session);
      continue;
    }
    parentIdBySessionId.set(session.id, parentId);
    const siblings = childrenByParentId.get(parentId) ?? [];
    siblings.push(session);
    childrenByParentId.set(parentId, siblings);
  }

  for (const children of childrenByParentId.values()) {
    children.sort((left, right) => getSessionDate(right).getTime() - getSessionDate(left).getTime());
  }

  const rootIdBySessionId = new Map<string, string>();
  for (const session of sessions) {
    let rootId = session.id;
    let parentId = parentIdBySessionId.get(rootId);
    while (parentId) {
      rootId = parentId;
      parentId = parentIdBySessionId.get(rootId);
    }
    rootIdBySessionId.set(session.id, rootId);
  }

  return { roots, childrenByParentId, rootIdBySessionId, parentIdBySessionId };
}

/** The ids of every parent above a session in the nesting, nearest first. */
export function getAncestorIds(sessionId: string, nested: NestedSessions): string[] {
  const ancestors: string[] = [];
  let parentId = nested.parentIdBySessionId.get(sessionId);
  while (parentId) {
    ancestors.push(parentId);
    parentId = nested.parentIdBySessionId.get(parentId);
  }
  return ancestors;
}

/** Parents whose children the user folded away; every other parent shows them. */
export function readCollapsedSessionParents(): Set<string> {
  try {
    const saved = localStorage.getItem(COLLAPSED_PARENTS_STORAGE_KEY);
    const parsed = saved ? (JSON.parse(saved) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

/**
 * Folds or unfolds one parent and returns the updated set. Re-reads storage
 * first, because every project group keeps its own copy of the set.
 */
export function toggleCollapsedSessionParent(parentId: string): Set<string> {
  const collapsed = readCollapsedSessionParents();
  if (collapsed.has(parentId)) {
    collapsed.delete(parentId);
  } else {
    collapsed.add(parentId);
  }
  try {
    localStorage.setItem(COLLAPSED_PARENTS_STORAGE_KEY, JSON.stringify([...collapsed]));
  } catch {
    // Storage unavailable: the fold still applies until the page reloads.
  }
  return collapsed;
}
