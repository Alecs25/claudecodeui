import assert from 'node:assert/strict';

import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { beforeEach, test, vi } from 'vitest';

import type { Project, SessionWithProvider, SidebarProjectListProps } from '@/shared/types';

/**
 * Sidebar status: an unread session shows a steady blue dot, a pinned one a pin,
 * a completed one is dimmed; the row's options carry the toggles and, where
 * split view is available, "Open in split view", which Ctrl/Cmd-click also does.
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
const { buildSessionStatusItems } = await import('@/modules/sidebar/utils/sessionStatusMenuItems');

const t = ((key: string) => key) as unknown as SidebarProjectListProps['t'];
const NOW = new Date('2026-08-21T10:00:00.000Z');
const noop = () => {};

const PROJECT = { projectId: 'project-1', displayName: 'project one', fullPath: '/tmp/project-1', sessions: [] } as unknown as Project;
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
    project: PROJECT,
    session: session('s1'),
    selectedSession: null,
    isProcessing: false,
    hasBackgroundWork: false,
    needsAttention: false,
    currentTime: NOW,
    isEditing: false,
    renameDraft: '',
    onRenameDraftChange: noop,
    onStartEditingSession: noop,
    onCancelEditingSession: noop,
    onSaveEditingSession: noop,
    onProjectSelect: noop,
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

test('pinned rows show a pin and completed rows are dimmed', () => {
  const { container } = renderRow({ session: session('s1', { isPinned: true, isCompleted: true }) });
  assert.ok(container.querySelector('[aria-label="sessionStatus.pinned"]'));
  assert.ok(container.querySelector('a')?.className.includes('opacity-60'));
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
