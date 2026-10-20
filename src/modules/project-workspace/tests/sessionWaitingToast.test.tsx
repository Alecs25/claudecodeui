import assert from 'node:assert/strict';

import type { ComponentProps } from 'react';
import { act, render, screen } from '@testing-library/react';
import { test } from 'vitest';

import '@/modules/i18n';
import SessionFinishedToasts from '@/modules/project-workspace/SessionFinishedToasts';
import WebSocketContext from '@/shared/context/WebSocketContext';
import type { ServerEvent } from '@/shared/types';

/**
 * Claude starting to wait on a session nobody is looking at gets a toast that
 * opens it; the toast goes once the session no longer waits.
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

test('a prompt opened on a session nobody watches toasts "Claude is waiting for your answer", gone once answered', () => {
  const bus = createBus();
  render(
    <WebSocketContext.Provider value={{ subscribe: bus.subscribe } as unknown as ComponentProps<typeof WebSocketContext.Provider>['value']}>
      <SessionFinishedToasts navigate={(() => undefined) as never} />
    </WebSocketContext.Provider>,
  );

  bus.emit({ kind: 'session_waiting', sessionId: 's1', sessionTitle: 'LICENSEPLANET', requestIds: ['q1'], openedUnseen: true, notify: true });
  const toast = screen.getByTestId('session-waiting-toast');
  assert.ok(toast.textContent?.includes('LICENSEPLANET'));
  assert.ok(toast.textContent?.includes('Claude is waiting for your answer'));

  bus.emit({ kind: 'session_waiting', sessionId: 's1', requestIds: [] });
  assert.equal(screen.queryByTestId('session-waiting-toast'), null);

  // Notifications turned off for "action required": no toast.
  bus.emit({ kind: 'session_waiting', sessionId: 's2', sessionTitle: 'Other', requestIds: ['q2'], openedUnseen: true, notify: false });
  assert.equal(screen.queryByTestId('session-waiting-toast'), null);
});
