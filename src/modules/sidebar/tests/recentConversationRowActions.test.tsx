import assert from 'node:assert/strict';

import { render } from '@testing-library/react';
import React from 'react';
import { beforeEach, test, vi } from 'vitest';

import type { ActiveSidebarRename, RecentConversationListItem, SessionRowActions, SidebarProjectListProps } from '@/shared/types';

/**
 * The flat list renders the same row, with the same controls, as the project
 * groups. These tests assert what the row resolves for it — which session,
 * which project, and the states that change the row's appearance — by
 * capturing the props of a stubbed SessionOptions, the way
 * sidebarRowProps.test.tsx captures the row props.
 */

const recordedOptionsProps: Record<string, unknown>[] = [];

vi.mock('@/modules/sidebar/SessionOptions', () => ({
  default: (props: Record<string, unknown>) => {
    recordedOptionsProps.push(props);
    return null;
  },
}));

const { default: SidebarRecentConversations } = await import('@/modules/sidebar/SidebarRecentConversations');

const t = ((key: string) => key) as unknown as SidebarProjectListProps['t'];
const NOW = new Date('2026-08-21T10:00:00.000Z');
const noop = () => {};

const conversation = (
  sessionId: string,
  overrides: Partial<RecentConversationListItem> = {},
): RecentConversationListItem => ({
  sessionId,
  provider: 'claude',
  projectId: 'project-1',
  projectDisplayName: 'project one',
  sessionTitle: `title of ${sessionId}`,
  lastActivity: '2026-08-21T09:30:00.000Z',
  ...overrides,
});

const makeActions = (overrides: Partial<SessionRowActions> = {}): SessionRowActions => ({
  activeRename: null,
  activeSessions: new Set<string>(),
  backgroundSessionIds: new Set<string>(),
  attentionSessionIds: new Set<string>(),
  waitingSessionIds: new Set<string>(),
  onRenameDraftChange: noop,
  onStartEditingSession: noop,
  onCancelEditingSession: noop,
  onSaveEditingSession: noop,
  onDeleteSession: noop,
  onArchiveSession: noop,
  onSetSessionStatus: noop,
  ...overrides,
});

const renderList = (
  conversations: RecentConversationListItem[],
  sessionActions: SessionRowActions,
) => render(
  <SidebarRecentConversations
    conversations={conversations}
    hasMore={false}
    isLoading={false}
    isLoadingMore={false}
    hasError={false}
    isFiltered={false}
    selectedSession={null}
    currentTime={NOW}
    sessionActions={sessionActions}
    onConversationSelect={noop}
    onLoadMore={noop}
    onRetry={noop}
    t={t}
  />,
);

beforeEach(() => {
  recordedOptionsProps.length = 0;
});

test('every conversation row gets the shared session controls', () => {
  renderList([conversation('s1'), conversation('s2')], makeActions());

  assert.equal(recordedOptionsProps.length, 2);
  assert.equal(recordedOptionsProps[0].sessionId, 's1');
  assert.equal(recordedOptionsProps[0].sessionName, 'title of s1');
  assert.equal(recordedOptionsProps[0].provider, 'claude');
  assert.equal(recordedOptionsProps[0].projectId, 'project-1');
});

test('a conversation with no known project still renders, and says so', () => {
  renderList([conversation('s1', { projectId: null })], makeActions());

  // SessionOptions withholds rename on a null projectId rather than guessing one.
  assert.equal(recordedOptionsProps.length, 1);
  assert.equal(recordedOptionsProps[0].projectId, null);
});

test('the rename open elsewhere does not put this row into editing', () => {
  const activeRename: ActiveSidebarRename = {
    target: 'session',
    id: 's2',
    projectId: 'project-1',
    draft: 'a new name',
  };
  const { container } = renderList([conversation('s1'), conversation('s2')], makeActions({ activeRename }));

  // The row being renamed swaps its title and controls for the field.
  assert.deepEqual(recordedOptionsProps.map((props) => props.sessionId), ['s1']);
  const inputs = container.querySelectorAll('input');
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].value, 'a new name');
});

test('a project rename never puts a session row into editing', () => {
  const activeRename: ActiveSidebarRename = { target: 'project', id: 's1', draft: 'x' };
  const { container } = renderList([conversation('s1')], makeActions({ activeRename }));

  assert.equal(recordedOptionsProps.length, 1);
  assert.equal(container.querySelector('input'), null);
});

test('a running session is marked processing and shows the spinner in its status slot', () => {
  const { container } = renderList(
    [conversation('s1'), conversation('s2')],
    makeActions({ activeSessions: new Set(['s1']) }),
  );

  assert.equal(recordedOptionsProps[0].isProcessing, true);
  assert.equal(recordedOptionsProps[1].isProcessing, false);
  assert.equal(container.querySelectorAll('.animate-spin').length, 1);
});

test('a session with only background work running gets the purple dot, not the spinner, and is not processing', () => {
  // Its turn has ended: the row's destructive actions stay available and
  // nothing spins, but the session still counts as running and says so.
  const { container } = renderList(
    [conversation('s1'), conversation('s2')],
    makeActions({ activeSessions: new Set(['s1']), backgroundSessionIds: new Set(['s1']) }),
  );

  assert.equal(recordedOptionsProps[0].isProcessing, false);
  assert.equal(container.querySelectorAll('.animate-spin').length, 0);
  const dots = container.querySelectorAll('[role="status"].bg-purple-500');
  assert.equal(dots.length, 1);
  assert.equal(dots[0].getAttribute('aria-label'), 'tooltips.backgroundWorkIndicator');
});

test('a session with unseen activity gets the unread dot, one waiting on a prompt the hand', () => {
  const { container } = renderList(
    [conversation('s1'), conversation('s2'), conversation('s3')],
    makeActions({
      attentionSessionIds: new Set(['s2']),
      activeSessions: new Set(['s3']),
      waitingSessionIds: new Set(['s3']),
    }),
  );

  assert.equal(container.querySelectorAll('[role="status"].bg-blue-500').length, 1);
  const hand = container.querySelector('[aria-label="tooltips.waitingSessionIndicator"]');
  assert.ok(hand);
  assert.equal(container.querySelectorAll('[data-testid="session-row"]').length, 3);
});

test('pinned conversations are listed first, under their own heading', () => {
  const { container } = renderList(
    [conversation('s1'), conversation('s2', { isPinned: true })],
    makeActions(),
  );

  const sections = container.querySelectorAll('section');
  assert.equal(sections.length, 2);
  assert.equal(sections[0].getAttribute('aria-label'), 'sessionStatus.pinnedSection');
  assert.deepEqual(recordedOptionsProps.map((props) => props.sessionId), ['s2', 's1']);
});
