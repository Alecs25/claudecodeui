import assert from 'node:assert/strict';

import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { beforeEach, test, vi } from 'vitest';

import type { Project, ProjectSession, SessionWithProvider, SidebarProjectListProps } from '@/shared/types';

/**
 * Sessions the Claude desktop app spawned from another one (task chips) sit
 * under their parent in its project group, on a tree line, and the parent can
 * fold them away; a child whose parent is not in the list stays a normal row.
 */

vi.mock('@/shared/hooks/useProviderCapabilities', () => ({
  useSessionForkingProviders: () => new Set(),
}));

vi.mock('@/modules/sidebar/SessionOptions', () => ({ default: () => null }));

const { default: SidebarProjectSessions } = await import('@/modules/sidebar/SidebarProjectSessions');
const { nestChildSessions } = await import('@/modules/sidebar/utils/sessionNesting');

const NOW = new Date('2026-10-20T10:00:00.000Z');
const noop = () => {};
const t = ((key: string) => key) as unknown as SidebarProjectListProps['t'];
const NO_IDS: ReadonlySet<string> = new Set<string>();

const PROJECT = {
  projectId: 'project-1',
  name: 'project-1',
  displayName: 'project one',
  fullPath: '/repo',
  sessions: [],
} as unknown as Project;

const session = (id: string, minutesAgo: number, parentSessionId: string | null = null): SessionWithProvider =>
  ({
    id,
    summary: id,
    lastActivity: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
    parentSessionId,
    __provider: 'claude',
  }) as unknown as SessionWithProvider;

// In the server's recency order: the children are newer than their parent.
const SESSIONS = [
  session('child-new', 1, 'parent'),
  session('other', 2),
  session('child-old', 3, 'parent'),
  session('orphan', 4, 'parent-elsewhere'),
  session('parent', 5),
];

const renderSessions = (sessions = SESSIONS, selectedSession: ProjectSession | null = null) =>
  render(
    React.createElement(SidebarProjectSessions, {
      project: PROJECT,
      isExpanded: true,
      sessions,
      showCompletedInline: false,
      selectedSession,
      initialSessionsLoaded: true,
      hasMoreSessions: false,
      isLoadingMoreSessions: false,
      activeSessions: NO_IDS,
      backgroundSessionIds: NO_IDS,
      attentionSessionIds: NO_IDS,
      waitingSessionIds: NO_IDS,
      currentTime: NOW,
      sessionRenameId: null,
      sessionRenameDraft: '',
      onRenameDraftChange: noop,
      onStartEditingSession: noop,
      onCancelEditingSession: noop,
      onSaveEditingSession: noop,
      onSessionSelect: noop,
      onDeleteSession: noop,
      onArchiveSession: noop,
      onSetSessionStatus: noop,
      onLoadMoreSessions: noop,
      selectedSessionIds: null,
      onSetSessionSelection: noop,
      onToggleSessionSelected: noop,
      onCancelSessionSelection: noop,
      onDeleteSelectedSessions: noop,
      t,
    }),
  );

const rowTitles = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('[data-testid="session-row"]')].map((row) => row.getAttribute('href')?.replace('/session/', '') ?? '');

const nestedTitles = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('[data-testid="session-children"] [data-testid="session-row"]')]
    .map((row) => row.getAttribute('href')?.replace('/session/', '') ?? '');

beforeEach(() => {
  localStorage.clear();
});

test('children are grouped under their parent, most recent first; an orphan stays a root', () => {
  const nested = nestChildSessions(SESSIONS);
  assert.deepEqual(nested.roots.map((row) => row.id), ['other', 'orphan', 'parent']);
  assert.deepEqual(nested.childrenByParentId.get('parent')?.map((row) => row.id), ['child-new', 'child-old']);
  assert.equal(nested.rootIdBySessionId.get('child-old'), 'parent');
});

test('a parent chain that loops back on itself stays flat', () => {
  const nested = nestChildSessions([session('a', 1, 'b'), session('b', 2, 'a')]);
  assert.deepEqual(nested.roots.map((row) => row.id), ['a', 'b']);
  assert.equal(nested.childrenByParentId.size, 0);
});

test('the children render right after the parent, indented, in the parent\'s position', () => {
  const { container } = renderSessions();
  assert.deepEqual(rowTitles(container), ['other', 'orphan', 'parent', 'child-new', 'child-old']);
  assert.deepEqual(nestedTitles(container), ['child-new', 'child-old']);
  assert.equal(container.querySelectorAll('[data-testid="session-children-toggle"]').length, 1);
});

test('the parent\'s chevron folds its children, and the fold is remembered', () => {
  const { container, unmount } = renderSessions();
  const toggle = container.querySelector<HTMLButtonElement>('[data-testid="session-children-toggle"]');
  assert.equal(toggle?.getAttribute('aria-expanded'), 'true');

  fireEvent.click(toggle!);
  assert.deepEqual(rowTitles(container), ['other', 'orphan', 'parent']);
  assert.equal(
    container.querySelector('[data-testid="session-children-toggle"]')?.getAttribute('aria-expanded'),
    'false',
  );
  unmount();

  const remounted = renderSessions();
  assert.deepEqual(rowTitles(remounted.container), ['other', 'orphan', 'parent']);
  fireEvent.click(remounted.container.querySelector('[data-testid="session-children-toggle"]')!);
  assert.deepEqual(rowTitles(remounted.container), ['other', 'orphan', 'parent', 'child-new', 'child-old']);
});

test('a folded parent still shows its children when one of them is the open session', () => {
  localStorage.setItem('sidebarCollapsedSessionParents', JSON.stringify(['parent']));
  const { container } = renderSessions(SESSIONS, SESSIONS[2]);
  assert.deepEqual(nestedTitles(container), ['child-new', 'child-old']);
});
