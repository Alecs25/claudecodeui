import { useCallback, useState } from 'react';

import type { SessionStatusFilter } from '@/shared/types';

const STATUS_FILTER_KEY = 'sidebar.statusFilter';
const PROJECT_FILTER_KEY = 'sidebar.projectFilter';
const GROUP_BY_PROJECT_KEY = 'sidebar.groupByProject';
const COLLAPSED_PROJECTS_KEY = 'sidebar.collapsedProjects';

const STATUS_FILTERS: readonly SessionStatusFilter[] = ['all', 'running', 'waiting', 'unread', 'pinned', 'completed'];

// Storage can be missing or throw (private windows, blocked site data); the
// sidebar then simply starts from the defaults every time.
const readStored = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStored = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The choice still applies for this session.
  }
};

const readStatusFilter = (): SessionStatusFilter => {
  const stored = readStored(STATUS_FILTER_KEY);
  return STATUS_FILTERS.includes(stored as SessionStatusFilter) ? (stored as SessionStatusFilter) : 'all';
};

const readCollapsedProjects = (): Set<string> => {
  try {
    const parsed = JSON.parse(readStored(COLLAPSED_PROJECTS_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
};

/**
 * The sidebar's view choices — status filter, project filter, grouping and the
 * project groups the user folded — kept per browser so the list comes back the
 * way it was left.
 */
export function useSidebarViewPreferences() {
  // Narrows every list to one status; read by the grouped list and sent to the recents endpoint.
  const [statusFilter, setStatusFilterState] = useState<SessionStatusFilter>(readStatusFilter);
  // The one project shown, or null for all of them; a stale id (project removed) is treated as null by the controller.
  const [projectFilter, setProjectFilterState] = useState<string | null>(() => readStored(PROJECT_FILTER_KEY) || null);
  // Grouped by project (the default) or one flat list ordered by recency.
  const [groupByProject, setGroupByProjectState] = useState<boolean>(() => readStored(GROUP_BY_PROJECT_KEY) !== 'false');
  // Groups are open unless folded, so only the folded ones need remembering.
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(readCollapsedProjects);

  const setStatusFilter = useCallback((filter: SessionStatusFilter) => {
    setStatusFilterState(filter);
    writeStored(STATUS_FILTER_KEY, filter);
  }, []);

  const setProjectFilter = useCallback((projectId: string | null) => {
    setProjectFilterState(projectId);
    writeStored(PROJECT_FILTER_KEY, projectId ?? '');
  }, []);

  const setGroupByProject = useCallback((grouped: boolean) => {
    setGroupByProjectState(grouped);
    writeStored(GROUP_BY_PROJECT_KEY, String(grouped));
  }, []);

  const updateCollapsedProjects = useCallback((update: (previous: Set<string>) => Set<string>) => {
    setCollapsedProjectIds((previous) => {
      const next = update(previous);
      if (next !== previous) {
        writeStored(COLLAPSED_PROJECTS_KEY, JSON.stringify([...next]));
      }
      return next;
    });
  }, []);

  return {
    statusFilter,
    setStatusFilter,
    projectFilter,
    setProjectFilter,
    groupByProject,
    setGroupByProject,
    collapsedProjectIds,
    updateCollapsedProjects,
  };
}
