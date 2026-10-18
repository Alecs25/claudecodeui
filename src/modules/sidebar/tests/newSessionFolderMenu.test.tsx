import assert from 'node:assert/strict';

import { fireEvent, render, screen } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { afterEach, test, vi } from 'vitest';

import SidebarHeader from '@/modules/sidebar/SidebarHeader';
import type { Project } from '@/shared/types';

/**
 * "New session" asks where to start, as Claude Code does: the folder in view
 * first, the other projects, then any folder on the machine.
 */

const t = ((key: string, options?: { defaultValue?: string } | string) => (
  typeof options === 'string' ? options : options?.defaultValue ?? key
)) as unknown as TFunction;

const project = (projectId: string, displayName: string): Project => ({
  projectId,
  displayName,
  path: `C:/dev/${displayName}`,
  fullPath: `C:/dev/${displayName}`,
  isStarred: false,
  sessions: [],
} as unknown as Project);

const renderHeader = (overrides: { newSessionProject?: Project | null; projects?: Project[] } = {}) => {
  const onNewSession = vi.fn();
  const onChooseFolderForSession = vi.fn();
  const projects = overrides.projects ?? [project('p-gym', 'GYM'), project('p-ht', 'HT')];
  render(
    <SidebarHeader
      isPWA={false}
      isMobile={false}
      onCollapseSidebar={() => {}}
      isSearchOpen={false}
      onToggleSearch={() => {}}
      searchFilter=""
      onSearchFilterChange={() => {}}
      onRefresh={() => {}}
      isRefreshing={false}
      onCreateProject={() => {}}
      onChooseFolderForSession={onChooseFolderForSession}
      isArchiveOpen={false}
      onOpenArchive={() => {}}
      onCloseArchive={() => {}}
      archivedCount={0}
      projects={projects}
      newSessionProject={overrides.newSessionProject === undefined ? projects[1] : overrides.newSessionProject}
      onNewSession={onNewSession}
      statusFilter="all"
      onStatusFilterChange={() => {}}
      projectFilter={null}
      onProjectFilterChange={() => {}}
      groupByProject
      onGroupByProjectChange={() => {}}
      t={t}
    />,
  );
  return { onNewSession, onChooseFolderForSession };
};

afterEach(() => {
  document.body.innerHTML = '';
});

test('the menu lists the folder in view first and offers any folder last', () => {
  const { onNewSession, onChooseFolderForSession } = renderHeader();

  fireEvent.click(screen.getByRole('button', { name: /sessions\.newSession/ }));
  const items = screen.getAllByRole('menuitem').map((item) => item.textContent ?? '');
  assert.match(items[0], /HT/);
  assert.match(items[0], /Current/);
  assert.match(items[1], /GYM/);
  assert.match(items.at(-1) ?? '', /Choose folder/);

  fireEvent.click(screen.getAllByRole('menuitem')[0]);
  assert.equal(onNewSession.mock.calls[0][0].projectId, 'p-ht');

  fireEvent.click(screen.getByRole('button', { name: /sessions\.newSession/ }));
  fireEvent.click(screen.getByRole('menuitem', { name: /Choose folder/ }));
  assert.equal(onChooseFolderForSession.mock.calls.length, 1);
});

test('with no project yet the button goes straight to the folder picker', () => {
  const { onChooseFolderForSession } = renderHeader({ projects: [], newSessionProject: null });

  fireEvent.click(screen.getByRole('button', { name: /sessions\.newSession/ }));
  assert.equal(onChooseFolderForSession.mock.calls.length, 1);
});
