import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, test, vi } from 'vitest';

import '@/modules/i18n';
import { useChatComposerState } from '@/modules/chat/hooks/useChatComposerState';
import { writeDraftText } from '@/shared/chatDrafts';
import type { PermissionMode, Project, ProjectSession } from '@/shared/types';

/**
 * After a turn the CLI predicts the next prompt. The composer greys it into
 * the empty box; Tab or → takes it, and it never leaks into another session.
 */

const PROJECT: Project = { projectId: 'project-1', displayName: 'Project One', fullPath: '/tmp/project-one' };
const SESSION: ProjectSession = { id: 'session-suggest' };

const render = (initial: { isLoading: boolean }) => {
  const sent: Array<Record<string, unknown>> = [];
  let cycled = 0;
  const view = renderHook(
    ({ isLoading }: { isLoading: boolean }) =>
      useChatComposerState({
        selectedProject: PROJECT,
        selectedSession: SESSION,
        currentSessionId: SESSION.id,
        provider: 'claude',
        permissionMode: 'default',
        cyclePermissionMode: () => { cycled += 1; },
        resolvePermissionModeForProvider: () => 'default' as PermissionMode,
        currentProviderModel: 'test-model',
        currentProviderEffort: 'medium',
        isLoading,
        canAbortSession: true,
        tokenBudget: null,
        sendMessage: (message) => { sent.push(message as Record<string, unknown>); },
        scrollToBottom: () => undefined,
        addMessage: () => undefined,
        setIsUserScrolledUp: () => undefined,
        setPendingPermissionRequests: () => undefined,
      }),
    { initialProps: initial },
  );
  return { view, sent, cycled: () => cycled };
};

const keyDown = (key: string) => {
  let prevented = false;
  return {
    event: {
      key,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      currentTarget: { value: '' },
      target: { value: '' },
      nativeEvent: { isComposing: false },
      preventDefault: () => { prevented = true; },
    } as never,
    prevented: () => prevented,
  };
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })));
  localStorage.clear();
  // The box is restored from the session draft, which an accepted suggestion writes.
  writeDraftText(SESSION.id, '');
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

test('a suggestion for the open session shows in the empty box and Tab takes it', () => {
  const { view, cycled } = render({ isLoading: false });
  act(() => { view.result.current.handlePromptSuggestion(SESSION.id, 'run the tests'); });
  assert.equal(view.result.current.promptSuggestion, 'run the tests');

  const tab = keyDown('Tab');
  act(() => { view.result.current.handleKeyDown(tab.event); });
  assert.equal(tab.prevented(), true);
  assert.equal(view.result.current.input, 'run the tests');
  assert.equal(view.result.current.promptSuggestion, null);
  assert.equal(cycled(), 0, 'Tab took the suggestion instead of cycling the mode');
});

test('ArrowRight takes the suggestion as well', () => {
  const { view } = render({ isLoading: false });
  act(() => { view.result.current.handlePromptSuggestion(SESSION.id, 'commit it'); });
  act(() => { view.result.current.handleKeyDown(keyDown('ArrowRight').event); });
  assert.equal(view.result.current.input, 'commit it');
});

test('with nothing suggested Tab still cycles the permission mode', () => {
  const { view, cycled } = render({ isLoading: false });
  act(() => { view.result.current.handleKeyDown(keyDown('Tab').event); });
  assert.equal(cycled(), 1);
});

test('a suggestion for another session is not shown', () => {
  const { view } = render({ isLoading: false });
  act(() => { view.result.current.handlePromptSuggestion('other-session', 'run the tests'); });
  assert.equal(view.result.current.promptSuggestion, null);
});

test('a new turn drops the suggestion for good', () => {
  const { view } = render({ isLoading: false });
  act(() => { view.result.current.handlePromptSuggestion(SESSION.id, 'run the tests'); });
  view.rerender({ isLoading: true });
  assert.equal(view.result.current.promptSuggestion, null);
  view.rerender({ isLoading: false });
  assert.equal(view.result.current.promptSuggestion, null, 'a turn that predicts nothing does not bring it back');
});

test('typing hides the suggestion', () => {
  const { view } = render({ isLoading: false });
  act(() => { view.result.current.handlePromptSuggestion(SESSION.id, 'run the tests'); });
  act(() => { view.result.current.setInput('something else'); });
  assert.equal(view.result.current.promptSuggestion, null);
});

test('sends ask the server for suggestions while the preference is on', async () => {
  const { view, sent } = render({ isLoading: false });
  act(() => { view.result.current.setInput('hello'); });
  await act(async () => { await view.result.current.handleSubmit({ preventDefault: () => undefined } as never); });
  const send = sent.find((message) => message.type === 'chat.send');
  assert.equal((send?.options as Record<string, unknown> | undefined)?.promptSuggestions, true);
});
