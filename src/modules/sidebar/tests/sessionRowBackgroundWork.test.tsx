import assert from 'node:assert/strict';

import { render } from '@testing-library/react';
import React from 'react';
import { beforeEach, test, vi } from 'vitest';

import type { SessionWithProvider, SidebarProjectListProps } from '@/shared/types';

/**
 * A session whose turn has ended while the tasks it launched still run takes
 * the row's status slot in the purple of the workflow and agent cards, saying
 * what is still going on — while the spinner and the destructive-action
 * lockout stay reserved for a response in flight.
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

const t = ((key: string) => key) as unknown as SidebarProjectListProps['t'];
const NOW = new Date('2026-08-21T10:00:00.000Z');
const noop = () => {};

// Touched a minute ago, so the green "recently active" dot would apply.
const SESSION = { id: 's1', summary: 'session one', lastActivity: '2026-08-21T09:59:00.000Z', __provider: 'claude' } as unknown as SessionWithProvider;

const renderRow = (state: { isProcessing: boolean; hasBackgroundWork: boolean }) => render(
  React.createElement(SidebarSessionItem, {
    projectId: 'project-1',
    session: SESSION,
    selectedSession: null,
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
    ...state,
  }),
);

beforeEach(() => {
  recordedOptionsProps.length = 0;
});

test('background work shows as the purple dot, with nothing spinning', () => {
  const idle = renderRow({ isProcessing: false, hasBackgroundWork: false });
  assert.equal(idle.container.querySelector('[role="status"]'), null, 'an idle, read session has an empty slot');
  idle.unmount();

  const { container } = renderRow({ isProcessing: false, hasBackgroundWork: true });

  const dot = container.querySelector('[role="status"]');
  assert.ok(dot);
  assert.ok(dot.className.includes('bg-purple-500'));
  assert.equal(dot.getAttribute('aria-label'), 'tooltips.backgroundWorkIndicator');
  assert.equal(container.querySelectorAll('.animate-spin').length, 0);
  assert.equal(recordedOptionsProps.at(-1)?.isProcessing, false, 'the row is not locked the way a responding one is');
});

test('a response in flight still spins and shows no dot', () => {
  const { container } = renderRow({ isProcessing: true, hasBackgroundWork: false });

  assert.equal(container.querySelector('[role="status"]'), null);
  assert.equal(container.querySelectorAll('.animate-spin').length, 1);
  assert.equal(recordedOptionsProps[0].isProcessing, true);
});
