import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, test, vi } from 'vitest';

import '@/modules/i18n';
import { useChatComposerState } from '@/modules/chat/hooks/useChatComposerState';
import type { PermissionMode, Project, PromptTextAnswerHandler } from '@/shared/types';

/**
 * A message sent while Claude waits on a question (or a plan) is the answer to
 * it, not a message queued behind a turn that cannot go on without that
 * answer. Commands and attachments still take their own path.
 */

const PROJECT: Project = { projectId: 'project-1', displayName: 'Project One', fullPath: '/tmp/project-one' };

const renderComposer = (handler: PromptTextAnswerHandler | null) => {
  const sent: Array<{ type: string }> = [];
  const promptTextAnswerRef = { current: handler };
  const view = renderHook(() =>
    useChatComposerState({
      selectedProject: PROJECT,
      selectedSession: { id: 'session-1' },
      currentSessionId: 'session-1',
      provider: 'claude',
      permissionMode: 'default',
      cyclePermissionMode: () => undefined,
      resolvePermissionModeForProvider: () => 'default' as PermissionMode,
      currentProviderModel: 'test-model',
      currentProviderEffort: 'medium',
      // The turn is running: it is the one waiting on the answer.
      isLoading: true,
      canAbortSession: true,
      tokenBudget: null,
      sendMessage: (message) => { sent.push(message as { type: string }); },
      scrollToBottom: () => undefined,
      addMessage: () => undefined,
      setIsUserScrolledUp: () => undefined,
      setPendingPermissionRequests: () => undefined,
      promptTextAnswerRef,
    }));
  return { view, sent };
};

const submit = async (view: ReturnType<typeof renderComposer>['view'], text: string) => {
  act(() => { view.result.current.setInput(text); });
  await act(async () => {
    await view.result.current.handleSubmit({ preventDefault: () => undefined } as never);
  });
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

test('a typed message answers the open question instead of being queued', async () => {
  const answers: string[] = [];
  const { view, sent } = renderComposer((text) => { answers.push(text); return true; });

  await submit(view, '  Only the storefront  ');

  assert.deepEqual(answers, ['Only the storefront']);
  assert.equal(view.result.current.input, '');
  assert.equal(view.result.current.queuedDraft, null);
  assert.equal(sent.filter((message) => message.type === 'chat.send').length, 0);
});

test('a command is not taken as an answer', async () => {
  const answers: string[] = [];
  const { view } = renderComposer((text) => { answers.push(text); return true; });

  await submit(view, '/btw what is #143?');

  assert.deepEqual(answers, []);
});

test('a card that cannot take the text leaves the message to the usual queue', async () => {
  const { view } = renderComposer(() => false);

  await submit(view, 'next thing to do');

  assert.equal(view.result.current.queuedDraft?.content, 'next thing to do');
});
