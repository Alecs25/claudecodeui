import assert from 'node:assert/strict';

import { fireEvent, render, screen } from '@testing-library/react';
import type * as ReactI18next from 'react-i18next';
import { afterEach, beforeEach, test, vi } from 'vitest';

import type { Project, ProjectSession, SidebarProjectListProps } from '@/shared/types';

/**
 * The collapsed sidebar is an icon rail; its Sessions icon opens the same
 * sidebar content over the chat, closed by the scrim, Esc or picking a session.
 */

const controller: Record<string, unknown> = {};
const expandStoredSidebar = vi.fn();
const toggleSearch = vi.fn();

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactI18next>()),
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));
vi.mock('@/shared/hooks/useDeviceSettings', () => ({ useDeviceSettings: () => ({ isPWA: false }) }));
vi.mock('@/shared/hooks/useVersionCheck', () => ({
  useVersionCheck: () => ({ updateAvailable: false, restartRequired: false, currentVersion: '1.0.0' }),
}));
vi.mock('@/shared/context/UiPreferencesContext', () => ({
  useUiPreferences: () => ({ sidebarVisible: true }),
  useSetUiPreference: () => () => {},
}));
vi.mock('@/modules/task-master', () => ({
  useTaskMaster: () => ({ setCurrentProject: () => {}, mcpServerStatus: null }),
  useTasksSettings: () => ({ tasksEnabled: false }),
}));
vi.mock('@/modules/command-palette', () => ({ usePaletteOps: () => ({ refreshProjects: async () => {} }) }));
vi.mock('@/shared/context/SessionProtectionContext', () => ({
  useBusySessionIdSet: () => new Set<string>(),
  useBackgroundSessionIdSet: () => new Set<string>(),
}));
vi.mock('@/modules/sidebar/hooks/useSidebarController', () => ({ useSidebarController: () => controller }));
vi.mock('@/modules/sidebar/SidebarModals', () => ({ default: () => null }));
vi.mock('@/modules/sidebar/SidebarContent', () => ({
  default: (props: { onCloseSidebar?: () => void; projectListProps: SidebarProjectListProps }) => (
    <div data-testid="sidebar-content">
      {props.onCloseSidebar && <button type="button" onClick={props.onCloseSidebar}>close-content</button>}
      <button
        type="button"
        onClick={() => props.projectListProps.onSessionSelect({ id: 's2' } as never, 'p1')}
      >
        pick-session
      </button>
    </div>
  ),
}));

const { default: Sidebar } = await import('@/modules/sidebar/Sidebar');
const { hasSessionsNeedingAttention } = await import('@/modules/sidebar/utils/sessionAttention');

const project = (sessions: Record<string, unknown>[] = []): Project => ({
  projectId: 'p1',
  displayName: 'HT',
  path: 'C:/dev/ht',
  fullPath: 'C:/dev/ht',
  sessions,
} as unknown as Project);

beforeEach(() => {
  Object.assign(controller, {
    isSidebarCollapsed: false,
    waitingSessionIds: new Set<string>(),
    sortedProjects: [project()],
    projectFilter: null,
    isSearchOpen: false,
    toggleSearch,
    handleSessionClick: vi.fn(),
    expandSidebar: expandStoredSidebar,
    collapseSidebar: vi.fn(),
    setShowNewProject: vi.fn(),
  });
  expandStoredSidebar.mockClear();
  toggleSearch.mockClear();
});

afterEach(() => {
  document.body.innerHTML = '';
});

const renderSidebar = (overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) => {
  const props = {
    projects: [project()],
    selectedProject: null,
    selectedSession: { id: 's1' } as ProjectSession,
    attentionSessionIds: new Set<string>(),
    onProjectSelect: () => {},
    onSessionSelect: () => {},
    onNewSession: () => {},
    isLoading: false,
    loadingProgress: null,
    onRefresh: () => {},
    onShowSettings: () => {},
    showSettings: false,
    settingsInitialTab: 'agents',
    onCloseSettings: () => {},
    isMobile: false,
    ...overrides,
  };
  const view = render(<Sidebar {...props} />);
  return { ...view, props };
};

test('auto-collapse shows the rail, and the Sessions icon opens the list over the chat', () => {
  renderSidebar({ isAutoCollapsed: true });
  assert.ok(screen.getByTestId('sidebar-rail'));
  assert.equal(screen.queryByTestId('sidebar-overlay'), null);

  fireEvent.click(screen.getByRole('button', { name: 'sessions.title' }));
  assert.ok(screen.getByTestId('sidebar-overlay'));
  assert.ok(screen.getByTestId('sidebar-content'));

  fireEvent.click(screen.getByTestId('sidebar-overlay-scrim'));
  assert.equal(screen.queryByTestId('sidebar-overlay'), null);
});

test('Esc, the panel close button and picking a session close the overlay', () => {
  renderSidebar({ isAutoCollapsed: true });
  const sessionsButton = screen.getByRole('button', { name: 'sessions.title' });

  fireEvent.click(sessionsButton);
  fireEvent.keyDown(document, { key: 'Escape' });
  assert.equal(screen.queryByTestId('sidebar-overlay'), null);

  fireEvent.click(sessionsButton);
  fireEvent.click(screen.getByRole('button', { name: 'close-content' }));
  assert.equal(screen.queryByTestId('sidebar-overlay'), null);

  fireEvent.click(sessionsButton);
  fireEvent.click(screen.getByRole('button', { name: 'pick-session' }));
  assert.equal(screen.queryByTestId('sidebar-overlay'), null);
});

test('landing on another session from anywhere closes the overlay', () => {
  const { rerender, props } = renderSidebar({ isAutoCollapsed: true });
  fireEvent.click(screen.getByRole('button', { name: 'sessions.title' }));
  rerender(<Sidebar {...props} isAutoCollapsed selectedSession={{ id: 's9' } as ProjectSession} />);
  assert.equal(screen.queryByTestId('sidebar-overlay'), null);
});

test('the rail search opens the list with its search field', () => {
  renderSidebar({ isAutoCollapsed: true });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  assert.ok(screen.getByTestId('sidebar-overlay'));
  assert.equal(toggleSearch.mock.calls.length, 1);
});

test('expanding from the rail tells the region it was manual', () => {
  const onManualExpand = vi.fn();
  renderSidebar({ isAutoCollapsed: true, onManualExpand });
  fireEvent.click(screen.getByRole('button', { name: 'common:versionUpdate.ariaLabels.showSidebar' }));
  assert.equal(onManualExpand.mock.calls.length, 1);
  assert.equal(expandStoredSidebar.mock.calls.length, 1);
});

test('the full sidebar renders without the rail, and below 768px auto-collapse is ignored', () => {
  renderSidebar();
  assert.equal(screen.queryByTestId('sidebar-rail'), null);
  document.body.innerHTML = '';
  renderSidebar({ isAutoCollapsed: true, isMobile: true });
  assert.equal(screen.queryByTestId('sidebar-rail'), null);
});

test('the Sessions icon carries a dot for a waiting or unread session', () => {
  controller.waitingSessionIds = new Set(['s3']);
  renderSidebar({ isAutoCollapsed: true });
  assert.ok(screen.getByTestId('sidebar-rail-attention-dot'));
});

test('a session counts for the dot when waiting, unread or flagged, never when on screen', () => {
  const none = new Set<string>();
  const input = { projects: [project([{ id: 's1' }])], waitingSessionIds: none, attentionSessionIds: none, selectedSessionId: 's1' };
  assert.equal(hasSessionsNeedingAttention(input), false);
  assert.equal(hasSessionsNeedingAttention({ ...input, waitingSessionIds: new Set(['s1']) }), true);
  assert.equal(hasSessionsNeedingAttention({ ...input, attentionSessionIds: new Set(['s1']) }), false);
  assert.equal(hasSessionsNeedingAttention({ ...input, attentionSessionIds: new Set(['s2']) }), true);
  assert.equal(hasSessionsNeedingAttention({ ...input, projects: [project([{ id: 's1', isUnread: true }])] }), false);
  assert.equal(hasSessionsNeedingAttention({ ...input, projects: [project([{ id: 's4', isUnread: true }])] }), true);
});
