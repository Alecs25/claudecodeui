import assert from 'node:assert/strict';

import { renderHook } from '@testing-library/react';
import { test } from 'vitest';

import { useChatRealtimeHandlers } from '@/modules/chat/hooks/useChatRealtimeHandlers';
import type { ServerEvent, ProjectSession } from '@/shared/types';
import type { SessionStore } from '@/modules/chat/hooks/useSessionStore';

/**
 * The predicted next prompt arrives as a `prompt_suggestion` status after the
 * turn's `complete`. It goes to the composer and must not read as activity,
 * which would put the finished session back into "working".
 */
test('a prompt_suggestion status reaches the composer without marking the session busy', () => {
  let listener: ((event: ServerEvent) => void) | null = null;
  const suggestions: Array<[string, string]> = [];
  const processing: Array<string | null | undefined> = [];

  renderHook(() => useChatRealtimeHandlers({
    isActive: true,
    subscribe: (fn) => {
      listener = fn;
      return () => { listener = null; };
    },
    provider: 'claude',
    selectedSession: { id: 'viewed-session' } as ProjectSession,
    currentSessionId: 'viewed-session',
    setTokenBudget: () => {},
    pendingPermissionRequests: [],
    setPendingPermissionRequests: () => {},
    streamTimerRef: { current: null },
    accumulatedStreamRef: { current: '' },
    lastSeqRef: { current: new Map() },
    statusCheckSentAtRef: { current: new Map() },
    requestLatestMessages: async () => {},
    sessionStore: {} as SessionStore,
    onSessionProcessing: (sessionId) => { processing.push(sessionId); },
    onPromptSuggestion: (sessionId, suggestion) => { suggestions.push([sessionId, suggestion]); },
  }));

  listener!({
    kind: 'status',
    text: 'prompt_suggestion',
    suggestion: 'run the tests',
    sessionId: 'viewed-session',
  } as unknown as ServerEvent);

  assert.deepEqual(suggestions, [['viewed-session', 'run the tests']]);
  assert.deepEqual(processing, []);
});
