import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { test, vi } from 'vitest';

import {
  publishBackgroundTasks,
  useBackgroundTasksEntry,
} from '@/modules/chat/utils/backgroundTasksRegistry';
import {
  readSessionPromptDetail,
  requestSessionPrompt,
  SESSION_PROMPT_EVENT,
} from '@/modules/chat/utils/sessionPrompt';

/**
 * Two bridges between the chat and the workspace panes outside it: the
 * Background pane reads the tasks the chat's strip published for its session,
 * and the Changes pane asks one session's composer to send a message.
 */

test('the Background pane sees the tasks published for its session only', () => {
  const sendMessage = vi.fn();
  const { result } = renderHook(({ sessionId }) => useBackgroundTasksEntry(sessionId), {
    initialProps: { sessionId: 'session-a' },
  });
  assert.equal(result.current, null);

  act(() => {
    publishBackgroundTasks('session-a', { items: [{ key: 't1', kind: 'Agent', name: 'tests', progress: '' }], sendMessage });
    publishBackgroundTasks('session-b', { items: [{ key: 't2', kind: 'Command', name: 'build', progress: '' }], sendMessage });
  });
  const entry = result.current as ReturnType<typeof useBackgroundTasksEntry>;
  assert.deepEqual(entry?.items.map((item) => item.key), ['t1']);

  act(() => {
    publishBackgroundTasks('session-a', null);
  });
  assert.equal(result.current, null);
  publishBackgroundTasks('session-b', null);
});

test('a session prompt names its session and is ignored when blank', () => {
  const listener = vi.fn();
  window.addEventListener(SESSION_PROMPT_EVENT, listener);
  requestSessionPrompt('session-a', '   ');
  requestSessionPrompt('session-a', ' review these lines ');
  window.removeEventListener(SESSION_PROMPT_EVENT, listener);

  assert.equal(listener.mock.calls.length, 1);
  assert.deepEqual(readSessionPromptDetail(listener.mock.calls[0][0] as Event), {
    sessionId: 'session-a',
    text: 'review these lines',
  });
  assert.equal(readSessionPromptDetail(new CustomEvent(SESSION_PROMPT_EVENT, { detail: { text: 'x' } })), null);
});
