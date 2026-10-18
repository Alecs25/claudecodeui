import assert from 'node:assert/strict';

import { act, renderHook, waitFor } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { afterEach, beforeEach, test, vi } from 'vitest';

import type { Project } from '@/shared/types';

/**
 * The sidebar search used to filter project names and titles only, so a word
 * that appeared in a chat but in no title found nothing. It now runs the
 * transcript search alongside; these pin when it does.
 */

const openedUrls: string[] = [];

class FakeEventSource {
  constructor(url: string) {
    openedUrls.push(url);
  }
  addEventListener() {}
  close() {}
}

vi.mock('@/shared/api', () => ({
  api: {
    searchConversationsUrl: (query: string) => `/api/providers/search/sessions?q=${encodeURIComponent(query)}`,
    recentConversations: () => Promise.resolve({ ok: true, json: async () => ({ data: { conversations: [], total: 0, hasMore: false } }) }),
    archivedProjects: () => Promise.resolve({ ok: true, json: async () => ({ data: { projects: [] } }) }),
    getArchivedSessions: () => Promise.resolve({ ok: true, json: async () => ({ data: { sessions: [] } }) }),
  },
}));

const { useSidebarController } = await import('@/modules/sidebar/hooks/useSidebarController');

const t = ((key: string) => key) as unknown as TFunction;

const PROJECT: Project = {
  projectId: 'project-1',
  path: '/repo',
  fullPath: '/repo',
  displayName: 'repo',
  sessions: [{ id: 's1', summary: 'I need a wos-19.20', __provider: 'claude' as const }],
  sessionMeta: { hasMore: false, total: 1 },
};

const ARGS = {
  projects: [PROJECT],
  selectedProject: null,
  selectedSession: null,
  activeSessions: new Set<string>(),
  backgroundSessionIds: new Set<string>(),
  isLoading: false,
  isMobile: false,
  t,
  onRefresh: vi.fn(),
  onProjectSelect: vi.fn(),
  onSessionSelect: vi.fn(),
  setCurrentProject: vi.fn(),
  setSidebarVisible: vi.fn(),
  sidebarVisible: true,
};

const renderController = () => renderHook(() => useSidebarController(ARGS));

beforeEach(() => {
  openedUrls.length = 0;
  (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;
});

afterEach(() => {
  delete (globalThis as { EventSource?: unknown }).EventSource;
});

test('a query in the search field filters the projects and also searches transcripts', async () => {
  const { result } = renderController();

  act(() => {
    result.current.toggleSearch();
  });
  act(() => {
    result.current.setSearchFilter('odm');
  });

  await waitFor(() => {
    assert.deepEqual(openedUrls, ['/api/providers/search/sessions?q=odm']);
  }, { timeout: 3000 });
  // The project list still filters by title; the transcript hits come alongside.
  assert.deepEqual(result.current.filteredProjects, []);
});

test('a session title match keeps its project, narrowed to that session and opened', async () => {
  const { result } = renderController();

  act(() => {
    result.current.toggleSearch();
  });
  act(() => {
    result.current.setSearchFilter('wos 19');
  });

  await waitFor(() => {
    assert.equal(result.current.filteredProjects.length, 1);
  }, { timeout: 3000 });
  assert.deepEqual(result.current.filteredProjects[0].sessions?.map((session) => session.id), ['s1']);
  assert.equal(result.current.isProjectExpanded('project-1'), true);
});

test('the archive does not search transcripts', async () => {
  const { result } = renderController();

  act(() => {
    result.current.openArchive();
    result.current.toggleSearch();
  });
  act(() => {
    result.current.setSearchFilter('odm');
  });

  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.deepEqual(openedUrls, []);
});
