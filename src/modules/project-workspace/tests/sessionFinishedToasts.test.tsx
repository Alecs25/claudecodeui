import assert from 'node:assert/strict';

import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { test, vi } from 'vitest';

import WebSocketContext from '@/shared/context/WebSocketContext';
import SessionFinishedToasts from '@/modules/project-workspace/SessionFinishedToasts';
import type { ServerEvent } from '@/shared/types';

/**
 * The server marks a run that ended unseen with `finishedUnseen`; the toast
 * shows for it (unless `notify` is false, the "run stopped" preference) and
 * opens the session from its button.
 */

const renderToasts = () => {
  let listener: ((event: ServerEvent) => void) | null = null;
  const navigate = vi.fn();
  const value = {
    ws: null,
    sendMessage: () => {},
    subscribe: (fn: (event: ServerEvent) => void) => {
      listener = fn;
      return () => { listener = null; };
    },
    isConnected: true,
    connectionStatus: 'connected' as const,
  };
  render(
    <WebSocketContext.Provider value={value}>
      <SessionFinishedToasts navigate={navigate} />
    </WebSocketContext.Provider>,
  );
  const dispatch = (event: ServerEvent) => act(() => { listener?.(event); });
  return { dispatch, navigate };
};

const finished = (fields: Record<string, unknown> = {}): ServerEvent => ({
  kind: 'session_status',
  sessionId: 's1',
  sessionTitle: 'Refactor auth',
  isPinned: false,
  isUnread: true,
  isCompleted: false,
  finishedUnseen: true,
  notify: true,
  ...fields,
});

test('a run that ended unseen shows a toast whose button opens the session', () => {
  const { dispatch, navigate } = renderToasts();

  dispatch(finished());

  assert.ok(screen.getByText('Refactor auth'));
  fireEvent.click(screen.getByText('Open'));
  assert.deepEqual(navigate.mock.calls, [['/session/s1']]);
  assert.equal(screen.queryByTestId('session-finished-toast'), null);
});

test('no toast for a plain status change or with completion notifications off', () => {
  const { dispatch } = renderToasts();

  dispatch(finished({ finishedUnseen: undefined }));
  dispatch(finished({ notify: false }));

  assert.equal(screen.queryByTestId('session-finished-toast'), null);
});
