import assert from 'node:assert/strict';

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, test, vi } from 'vitest';

import { useChatRealtimeHandlers } from '@/modules/chat/hooks/useChatRealtimeHandlers';
import type { NormalizedMessage, ProjectSession, ServerEvent } from '@/shared/types';
import type { SessionStore } from '@/modules/chat/hooks/useSessionStore';

/**
 * A chat pane buffers the streamed text of the session it shows. In split view
 * two sessions stream at once into two panes that each hear every frame; the
 * other session's deltas used to be added to the same buffer, so its text was
 * written into the viewed reply. Each pane now buffers only its own session.
 *
 * The sidebar's `session_status` frame carries a sessionId too, and must never
 * be filed into a transcript as a message.
 */

const renderHandlers = () => {
  let listener: ((event: ServerEvent) => void) | null = null;
  const appended: Array<{ sessionId: string; kind: unknown }> = [];
  const streamed: Array<{ sessionId: string; text: string }> = [];
  const finalized: string[] = [];

  renderHook(() => useChatRealtimeHandlers({
    isActive: true,
    subscribe: (fn) => {
      listener = fn;
      return () => { listener = null; };
    },
    provider: 'claude',
    selectedSession: { id: 'viewed' } as ProjectSession,
    currentSessionId: 'viewed',
    setTokenBudget: () => {},
    pendingPermissionRequests: [],
    setPendingPermissionRequests: () => {},
    streamTimerRef: { current: null },
    accumulatedStreamRef: { current: '' },
    lastSeqRef: { current: new Map() },
    statusCheckSentAtRef: { current: new Map() },
    requestLatestMessages: async () => {},
    sessionStore: {
      appendRealtime: (sessionId: string, msg: NormalizedMessage) => { appended.push({ sessionId, kind: msg.kind }); },
      getMessages: () => [],
      updateStreaming: (sessionId: string, text: string) => { streamed.push({ sessionId, text }); },
      finalizeStreaming: (sessionId: string) => { finalized.push(sessionId); },
    } as unknown as SessionStore,
  }));

  const dispatch = (event: ServerEvent) => listener?.(event);
  return { dispatch, appended, streamed, finalized };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test('another session streaming at the same time does not leak into the viewed reply', () => {
  const { dispatch, streamed, appended, finalized } = renderHandlers();

  dispatch({ kind: 'stream_delta', sessionId: 'viewed', content: 'Hello ' });
  dispatch({ kind: 'stream_delta', sessionId: 'other', content: 'XXX' });
  dispatch({ kind: 'stream_delta', sessionId: 'viewed', content: 'world' });
  vi.advanceTimersByTime(150);
  dispatch({ kind: 'stream_end', sessionId: 'other' });
  dispatch({ kind: 'stream_end', sessionId: 'viewed' });

  assert.deepEqual(streamed.at(-1), { sessionId: 'viewed', text: 'Hello world' });
  assert.ok(streamed.every((entry) => entry.sessionId === 'viewed' && !entry.text.includes('XXX')));
  assert.deepEqual(appended, [{ sessionId: 'other', kind: 'stream_delta' }]);
  assert.deepEqual(finalized, ['other', 'viewed']);
});

test('a session_status frame is not filed into the transcript', () => {
  const { dispatch, appended } = renderHandlers();

  dispatch({ kind: 'session_status', sessionId: 'viewed', isPinned: true, isUnread: false, isCompleted: false });

  assert.deepEqual(appended, []);
});
