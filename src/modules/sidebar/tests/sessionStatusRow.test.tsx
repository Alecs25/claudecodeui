import assert from 'node:assert/strict';

import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { beforeEach, test, vi } from 'vitest';

import type { SessionWithProvider, SidebarProjectListProps } from '@/shared/types';

/**
 * Sidebar status: one icon at the row's left edge — amber hand while a prompt
 * is open, spinner while responding, steady blue dot when unread, grey check
 * when completed. The row's options carry the toggles and, where split view is
 * available, "Open in split view", which Ctrl/Cmd-click also does.
 */

const recordedOptionsProps: Record<string, unknown>[] = [];

vi.mock('@/shared/hooks/useProviderCapabilities', () => ({
  useSessionForkingProviders: () => new Set(),
}));

vi.mock('@/modules/sidebar/SessionOptions', () => ({
  default: (props: Record<string, unknown>) => {
    recordedOptionsProps.push(props);
    return null;
  },
}));

const { default: SidebarSessionItem } = await import('@/modules/sidebar/SidebarSessionItem');
const { partitionSessionsByStatus } = await import('@/modules/sidebar/SidebarProjectSessions');
const { buildSessionMenuItems, buildSessionStatusItems } = await import('@/modules/sidebar/utils/sessionStatusMenuItems');

const t = ((key: string) => key) as unknown as SidebarProjectListProps['t'];
const NOW = new Date('2026-08-21T10:00:00.000Z');
const noop = () => {};

// Old enough that the green "recently active" dot does not apply.
const session = (id: string, flags: Partial<SessionWithProvider> = {}) => ({
  id,
  summary: `session ${id}`,
  lastActivity: '2026-08-01T09:00:00.000Z',
  __provider: 'claude',
  ...flags,
}) as unknown as SessionWithProvider;

const renderRow = (overrides: Record<string, unknown> = {}) => render(
  React.createElement(SidebarSessionItem, {
    projectId: 'project-1',
    session: session('s1'),
    selectedSession: null,
    isProcessing: false,
    hasBackgroundWork: false,
    needsAttention: false,
    isWaiting: false,
    currentTime: NOW,
    isEditing: false,
    renameDraft: '',
    onRenameDraftChange: noop,
    onStartEditingSession: noop,
    onCancelEditingSession: noop,
    onSaveEditingSession: noop,
    onSessionSelect: noop,
    onDeleteSession: noop,
    onSetSessionStatus: noop,
    isSelecting: false,
    isChecked: false,
    onToggleSessionSelected: noop,
    t,
    ...overrides,
  }),
);

beforeEach(() => {
  recordedOptionsProps.length = 0;
});

test('pinned sessions come first and completed ones are set apart, recency kept within each group', () => {
  const { openSessions, completedSessions } = partitionSessionsByStatus([
    session('a'),
    session('b', { isPinned: true }),
    session('c', { isCompleted: true }),
    session('d', { isPinned: true }),
    session('e'),
  ]);

  assert.deepEqual(openSessions.map((row) => row.id), ['b', 'd', 'a', 'e']);
  assert.deepEqual(completedSessions.map((row) => row.id), ['c']);
});

test('an unread session shows a steady blue dot until it is the selected one', () => {
  const unread = renderRow({ session: session('s1', { isUnread: true }) });
  const dot = unread.container.querySelector('[role="status"]');
  assert.ok(dot);
  assert.ok(dot.className.includes('bg-blue-500'));
  assert.ok(!dot.className.includes('animate-pulse'));
  assert.equal(dot.getAttribute('aria-label'), 'tooltips.unreadSessionIndicator');
  unread.unmount();

  const selected = renderRow({ session: session('s1', { isUnread: true }), selectedSession: { id: 's1' } });
  assert.equal(selected.container.querySelector('[role="status"]'), null);
});

test('completed rows show the grey check and a muted title', () => {
  const { container } = renderRow({ session: session('s1', { isCompleted: true }) });
  assert.ok(container.querySelector('[aria-label="sessionStatus.completed"]'));
  assert.ok(container.querySelector('[title="session s1"]')?.className.includes('text-muted-foreground'));
});

test('activity seen elsewhere reads as unread, and an open prompt outranks the spinner', () => {
  const attention = renderRow({ needsAttention: true });
  assert.ok(attention.container.querySelector('[role="status"].bg-blue-500'));
  attention.unmount();

  const waiting = renderRow({ isWaiting: true, isProcessing: true });
  const hand = waiting.container.querySelector('[role="status"]');
  assert.equal(hand?.getAttribute('aria-label'), 'tooltips.waitingSessionIndicator');
  assert.equal(waiting.container.querySelectorAll('.animate-spin').length, 0);
  // A session waiting for the user stands out in the list.
  assert.ok(waiting.container.querySelector('[title="session s1"].font-semibold'));
});

test('a row has a single line: title and age, no message count', () => {
  const { container } = renderRow({ session: session('s1', { messageCount: 4321 }) });
  assert.equal(container.querySelectorAll('time').length, 1);
  assert.equal(container.textContent?.includes('4321'), false);
});

test('Ctrl/Cmd-click opens split view where available, and a plain click still selects', () => {
  const onOpenInSplitView = vi.fn();
  const onSessionSelect = vi.fn();
  const { container } = renderRow({ onOpenInSplitView, onSessionSelect });
  const link = container.querySelector('a');
  assert.ok(link);

  fireEvent.click(link, { ctrlKey: true });
  fireEvent.click(link, { metaKey: true });
  assert.equal(onOpenInSplitView.mock.calls.length, 2);
  assert.equal(onSessionSelect.mock.calls.length, 0);

  fireEvent.click(link);
  assert.equal(onSessionSelect.mock.calls.length, 1);
  assert.equal(typeof recordedOptionsProps.at(-1)?.onOpenInSplitView, 'function');
});

test('without split view the options menu has no split entry', () => {
  renderRow();
  assert.equal(recordedOptionsProps.at(-1)?.onOpenInSplitView, undefined);
});

test('status toggles flip the current flag', () => {
  const onSetSessionStatus = vi.fn();
  const items = buildSessionStatusItems('s1', { isPinned: true, isUnread: false, isCompleted: false }, onSetSessionStatus, t);

  assert.deepEqual(items.map((item) => item.label), [
    'sessionStatus.unpin',
    'sessionStatus.markUnread',
    'sessionStatus.markCompleted',
  ]);
  items.forEach((item) => item.onSelect());
  assert.deepEqual(onSetSessionStatus.mock.calls, [
    ['s1', { isPinned: false }],
    ['s1', { isUnread: true }],
    ['s1', { isCompleted: true }],
  ]);
  assert.deepEqual(buildSessionStatusItems('s1', {}, undefined, t), []);
});

test('the session menu archives directly, asks before deleting, and withholds both while responding', () => {
  const onArchiveSession = vi.fn();
  const onDeleteSession = vi.fn();
  const build = (isProcessing: boolean) => buildSessionMenuItems({
    sessionId: 's1',
    sessionName: 'session s1',
    projectId: 'project-1',
    status: {},
    isProcessing,
    canFork: false,
    canDelete: true,
    copy: { label: 'copy', icon: (() => null) as never, loading: false, onSelect: noop },
    onStartEditingSession: noop,
    onSetSessionStatus: noop,
    onArchiveSession,
    onDeleteSession,
    t,
  });

  const items = build(false);
  assert.deepEqual(items.map((item) => item.key), ['rename', 'pin', 'unread', 'completed', 'copy', 'archive', 'delete']);
  items.find((item) => item.key === 'archive')?.onSelect();
  items.find((item) => item.key === 'delete')?.onSelect();
  assert.deepEqual(onArchiveSession.mock.calls, [['s1']]);
  assert.deepEqual(onDeleteSession.mock.calls, [['s1', 'session s1']]);

  assert.deepEqual(build(true).map((item) => item.key), ['rename', 'pin', 'unread', 'completed', 'copy']);
});
