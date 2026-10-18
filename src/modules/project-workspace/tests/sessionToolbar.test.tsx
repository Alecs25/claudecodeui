import assert from 'node:assert/strict';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, test, vi } from 'vitest';

import type { AppTab, Project, ProjectSession } from '@/shared/types';

/**
 * The session header after the toolbar revamp: the title's caret opens the
 * session menu (rename, pin, view, side chat, completed, side by side,
 * archive), and the toolbar opens panes beside the chat instead of tabs that
 * replaced it, with the "+N −M" chip for the uncommitted changes.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/modules/plugins', () => ({
  usePlugins: () => ({ plugins: [] }),
}));

const apiMock = vi.hoisted(() => ({
  setSessionStatus: vi.fn(),
  deleteSession: vi.fn(),
}));

vi.mock('@/shared/api', () => ({ api: apiMock }));

const { default: WorkspaceTitle } = await import('@/modules/project-workspace/WorkspaceTitle');
const { default: WorkspaceToolbar } = await import('@/modules/project-workspace/session-toolbar/WorkspaceToolbar');
const { readPaneShortcut } = await import('@/modules/project-workspace/hooks/usePaneShortcuts');

const project: Project = {
  projectId: 'project-1',
  path: '/repo',
  fullPath: '/repo',
  displayName: 'HT',
  isStarred: false,
  sessions: [],
  sessionMeta: { hasMore: false, total: 0 },
};

const session: ProjectSession = {
  id: 'session-1',
  summary: 'Planner',
  __provider: 'claude',
  __projectId: 'project-1',
  isPinned: false,
  isCompleted: false,
};

const okResponse = () => ({ ok: true, status: 200 }) as Response;

beforeEach(() => {
  apiMock.setSessionStatus.mockReset().mockResolvedValue(okResponse());
  apiMock.deleteSession.mockReset().mockResolvedValue(okResponse());
});

afterEach(() => {
  vi.restoreAllMocks();
});

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /Planner/ }));
const menuItem = (name: string | RegExp) => screen.getByRole('menuitem', { name });

test('the subtitle names the project and the branch', () => {
  render(<WorkspaceTitle selectedProject={project} selectedSession={session} branch="main" onRenameSession={async () => true} />);
  assert.ok(screen.getByText('HT · main'));
});

test('the caret opens the session menu and Rename edits the title in place', () => {
  render(<WorkspaceTitle selectedProject={project} selectedSession={session} onRenameSession={async () => true} />);
  openMenu();
  fireEvent.click(menuItem('Rename'));
  assert.equal(screen.queryByRole('menu'), null);
  assert.equal((screen.getByRole('textbox') as HTMLInputElement).value, 'Planner');
});

test('pin and completed patch the session status and the labels follow', async () => {
  render(<WorkspaceTitle selectedProject={project} selectedSession={session} onRenameSession={async () => true} />);
  openMenu();
  await act(async () => {
    fireEvent.click(menuItem('Pin'));
  });
  assert.deepEqual(apiMock.setSessionStatus.mock.calls[0], ['session-1', { isPinned: true }]);

  openMenu();
  assert.ok(menuItem('Unpin'));
  await act(async () => {
    fireEvent.click(menuItem('Mark completed'));
  });
  assert.deepEqual(apiMock.setSessionStatus.mock.calls[1], ['session-1', { isCompleted: true }]);
});

test('the view picker sits in the menu and keeps it open', () => {
  const onViewModeChange = vi.fn();
  render(
    <WorkspaceTitle
      selectedProject={project}
      selectedSession={session}
      onRenameSession={async () => true}
      viewMode="normal"
      onViewModeChange={onViewModeChange}
    />,
  );
  openMenu();
  const verbose = screen.getByRole('menuitemradio', { name: 'Verbose' });
  assert.equal(screen.getByRole('menuitemradio', { name: 'Normal' }).getAttribute('aria-checked'), 'true');
  fireEvent.click(verbose);
  assert.deepEqual(onViewModeChange.mock.calls[0], ['verbose']);
  assert.ok(screen.getByRole('menu'));
});

test('side chat asks the side-chat module to open for this session', () => {
  const listener = vi.fn();
  window.addEventListener('cloudcli:open-side-chat', listener);
  render(<WorkspaceTitle selectedProject={project} selectedSession={session} onRenameSession={async () => true} />);
  openMenu();
  fireEvent.click(menuItem(/^Side chat/));
  window.removeEventListener('cloudcli:open-side-chat', listener);
  assert.equal(listener.mock.calls.length, 1);
  assert.deepEqual((listener.mock.calls[0][0] as CustomEvent).detail, { sessionId: 'session-1' });
});

test('archive asks first, then archives and drops the session', async () => {
  const onSessionArchived = vi.fn();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  render(
    <WorkspaceTitle
      selectedProject={project}
      selectedSession={session}
      onRenameSession={async () => true}
      onSessionArchived={onSessionArchived}
    />,
  );
  openMenu();
  await act(async () => {
    fireEvent.click(menuItem('Archive'));
  });
  assert.equal(apiMock.deleteSession.mock.calls.length, 0);

  openMenu();
  await act(async () => {
    fireEvent.click(menuItem('Archive'));
  });
  assert.equal(confirm.mock.calls.length, 2);
  assert.deepEqual(apiMock.deleteSession.mock.calls[0], ['session-1', false]);
  assert.deepEqual(onSessionArchived.mock.calls[0], ['session-1']);
});

test('side by side is offered only with a session to put there', () => {
  const onToggle = vi.fn();
  const { rerender } = render(
    <WorkspaceTitle
      selectedProject={project}
      selectedSession={session}
      onRenameSession={async () => true}
      split={{ isOpen: false, canOpen: false, onToggle }}
    />,
  );
  openMenu();
  assert.equal((menuItem('Open side by side') as HTMLButtonElement).disabled, true);

  rerender(
    <WorkspaceTitle
      selectedProject={project}
      selectedSession={session}
      onRenameSession={async () => true}
      split={{ isOpen: true, canOpen: false, onToggle }}
    />,
  );
  fireEvent.click(menuItem('Close side by side'));
  assert.equal(onToggle.mock.calls.length, 1);
});

const renderToolbar = (overrides: { activeTab?: AppTab; isMobile?: boolean } = {}) => {
  const onTogglePane = vi.fn();
  render(
    <WorkspaceToolbar
      activeTab={overrides.activeTab ?? 'chat'}
      onTogglePane={onTogglePane}
      changes={{ branch: 'main', files: [], added: 12, deleted: 1 }}
      shouldShowTasksTab
      shouldShowBrowserTab
      isMobile={overrides.isMobile ?? false}
    />,
  );
  return onTogglePane;
};

test('the toolbar opens Terminal, Changes and Preview as panes', () => {
  const onTogglePane = renderToolbar({ activeTab: 'shell' });
  assert.equal(screen.getByRole('button', { name: 'Terminal' }).getAttribute('aria-pressed'), 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Changes: +12 −1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  assert.deepEqual(onTogglePane.mock.calls, [['diff'], ['browser']]);
});

test('on a phone only the chip and ⋮ stay, and ⋮ lists the rest', () => {
  const onTogglePane = renderToolbar({ isMobile: true });
  assert.equal(screen.queryByRole('button', { name: 'Terminal' }), null);
  assert.ok(screen.getByRole('button', { name: 'Changes: +12 −1' }));
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  const labels = screen.getAllByRole('menuitem').map((item) => item.textContent);
  assert.deepEqual(labels, ['Terminal', 'Preview', 'Files', 'Git', 'Plan', 'Background tasks']);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Git' }));
  assert.deepEqual(onTogglePane.mock.calls[0], ['git']);
});

test('Ctrl+Shift+D toggles Changes and Ctrl+` the terminal', () => {
  const base = { key: '', code: '', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false };
  assert.equal(readPaneShortcut({ ...base, key: 'D', shiftKey: true }), 'diff');
  assert.equal(readPaneShortcut({ ...base, key: '`', code: 'Backquote' }), 'shell');
  // Italian layout: the key in that position sends a backslash.
  assert.equal(readPaneShortcut({ ...base, key: '\\', code: 'Backquote' }), 'shell');
  assert.equal(readPaneShortcut({ ...base, key: 'd' }), null);
  assert.equal(readPaneShortcut({ ...base, key: 'D', shiftKey: true, metaKey: true }), null);
});
