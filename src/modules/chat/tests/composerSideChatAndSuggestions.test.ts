import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, test, vi } from 'vitest';

import '@/modules/i18n';
import { useChatComposerState } from '@/modules/chat/hooks/useChatComposerState';
import { startSuggestedSession } from '@/modules/chat/utils/sessionSuggestions';
import { OPEN_SIDE_CHAT_EVENT } from '@/shared/constants';
import type { PermissionMode, Project, ProjectSession } from '@/shared/types';

/**
 * `/btw <question>` opens the side chat instead of reaching the session, even
 * mid-turn (where an ordinary message would be queued). A suggestion card's
 * "Start session" hands its prompt to the composer of the new, empty chat,
 * which sends it as the first message.
 */

const PROJECT: Project = { projectId: 'project-1', displayName: 'Project One', fullPath: '/tmp/project-one' };

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const renderComposer = (session: ProjectSession | null, isLoading: boolean) => {
  const sent: Array<{ type: string; sessionId?: string; content?: string }> = [];
  const view = renderHook(() =>
    useChatComposerState({
      selectedProject: PROJECT,
      selectedSession: session,
      currentSessionId: session?.id ?? null,
      provider: 'claude',
      permissionMode: 'default',
      cyclePermissionMode: () => undefined,
      resolvePermissionModeForProvider: () => 'default' as PermissionMode,
      currentProviderModel: 'test-model',
      currentProviderEffort: 'medium',
      isLoading,
      canAbortSession: isLoading,
      tokenBudget: null,
      sendMessage: (message) => { sent.push(message as { type: string }); },
      onSessionEstablished: () => undefined,
      scrollToBottom: () => undefined,
      addMessage: () => undefined,
      setIsUserScrolledUp: () => undefined,
      setPendingPermissionRequests: () => undefined,
    }));
  return { view, sent };
};

const submit = async (view: ReturnType<typeof renderComposer>['view'], text: string) => {
  act(() => { view.result.current.setInput(text); });
  await act(async () => {
    await view.result.current.handleSubmit({ preventDefault: () => undefined } as never);
  });
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url) === '/api/providers/sessions' && init?.method === 'POST') {
      return jsonResponse({ success: true, data: { sessionId: 'new-session', sessionName: 'Suggested' } }, 201);
    }
    return jsonResponse([]);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

test('/btw mid-turn opens the side chat for this session and sends nothing', async () => {
  const opened: unknown[] = [];
  const onOpen = (event: Event) => opened.push((event as CustomEvent).detail);
  window.addEventListener(OPEN_SIDE_CHAT_EVENT, onOpen);
  const { view, sent } = renderComposer({ id: 'session-1' }, true);

  await submit(view, '/btw why did the build fail?');
  window.removeEventListener(OPEN_SIDE_CHAT_EVENT, onOpen);

  assert.deepEqual(opened, [{ sessionId: 'session-1', question: 'why did the build fail?' }]);
  assert.equal(sent.length, 0);
  assert.equal(view.result.current.queuedDraft, null);
  assert.equal(view.result.current.input, '');
});

test('the new chat of the project sends a suggested session prompt as its first message', async () => {
  const { sent } = renderComposer(null, false);

  await act(async () => {
    startSuggestedSession(PROJECT, 'Remove the unused helper in src/a.ts');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const sends = sent.filter((message) => message.type === 'chat.send');
  assert.equal(sends.length, 1);
  assert.equal(sends[0].sessionId, 'new-session');
  assert.equal(sends[0].content, 'Remove the unused helper in src/a.ts');
});
