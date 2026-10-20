import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { test } from 'vitest';

import '@/modules/i18n';
import { useWaitingSessionIds } from '@/modules/sidebar/hooks/useWaitingSessionIds';
import type { ServerEvent } from '@/shared/types';

/**
 * A session whose run waits on a question, a plan or a permission shows the
 * hand in the sidebar, also when this tab never subscribed to it: the server
 * announces it.
 */

function createBus() {
  const listeners = new Set<(event: ServerEvent) => void>();
  return {
    subscribe: (listener: (event: ServerEvent) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: (event: ServerEvent) => act(() => listeners.forEach((listener) => listener(event))),
  };
}

const NO_ACTIVE = new Set<string>();

test('a session the server says is waiting counts, until the server says it is not', () => {
  const bus = createBus();
  const { result } = renderHook(() => useWaitingSessionIds(bus.subscribe, NO_ACTIVE));

  bus.emit({ kind: 'session_waiting', sessionId: 'elsewhere', requestIds: ['q1'], toolNames: ['AskUserQuestion'] });
  assert.deepEqual([...result.current], ['elsewhere']);

  bus.emit({ kind: 'session_waiting', sessionId: 'elsewhere', requestIds: [] });
  assert.deepEqual([...result.current], []);
});

test('the snapshot sent on connect replaces what the tab knew', () => {
  const bus = createBus();
  const { result } = renderHook(() => useWaitingSessionIds(bus.subscribe, NO_ACTIVE));

  bus.emit({ kind: 'session_waiting', sessionId: 'stale', requestIds: ['old'] });
  bus.emit({ kind: 'sessions_waiting_snapshot', sessions: [{ sessionId: 'fresh', requestIds: ['plan1'] }] });
  assert.deepEqual([...result.current], ['fresh']);

  // The end of the run closes it too.
  bus.emit({ kind: 'complete', sessionId: 'fresh' });
  assert.deepEqual([...result.current], []);

  // A reconnect forgets what may have closed unheard.
  bus.emit({ kind: 'session_waiting', sessionId: 'unheard', requestIds: ['q9'] });
  bus.emit({ kind: 'websocket_reconnected' });
  assert.deepEqual([...result.current], []);
});

test('a question prompt on a watched, busy session counts from the run events', () => {
  const bus = createBus();
  const { result } = renderHook(() => useWaitingSessionIds(bus.subscribe, new Set(['watched'])));

  bus.emit({ kind: 'permission_request', sessionId: 'watched', requestId: 'q1', toolName: 'AskUserQuestion' });
  assert.deepEqual([...result.current], ['watched']);
  bus.emit({ kind: 'permission_resolved', sessionId: 'watched', requestId: 'q1' });
  assert.deepEqual([...result.current], []);
});
