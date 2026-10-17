import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, test, vi } from 'vitest';

import '@/modules/i18n';
import { useChatComposerState } from '@/modules/chat/hooks/useChatComposerState';
import { clearQueuedMessage, writeQueuedMessage } from '@/shared/chatDrafts';
import type { ChatMessage, PermissionMode, Project, ProjectSession } from '@/shared/types';

/**
 * A message queued while Claude works can be sent into the running turn
 * ("Send now", `chat.steer`) or pulled back into the empty composer with
 * ArrowUp or Esc. The server answers a steer with `steer_result`; only an
 * accepted one leaves the queue and joins the transcript.
 */

const PROJECT: Project = { projectId: 'project-1', displayName: 'Project One', fullPath: '/tmp/project-one' };
const SESSION: ProjectSession = { id: 'session-steer' };

const render = (options: { supportsSteering: boolean }) => {
  const sent: Array<Record<string, unknown>> = [];
  const added: ChatMessage[] = [];
  const view = renderHook(() =>
    useChatComposerState({
      selectedProject: PROJECT,
      selectedSession: SESSION,
      currentSessionId: SESSION.id,
      provider: 'claude',
      permissionMode: 'default',
      cyclePermissionMode: () => undefined,
      resolvePermissionModeForProvider: () => 'default' as PermissionMode,
      currentProviderModel: 'test-model',
      currentProviderEffort: 'medium',
      isLoading: true,
      canAbortSession: true,
      tokenBudget: null,
      sendMessage: (message) => { sent.push(message as Record<string, unknown>); },
      scrollToBottom: () => undefined,
      addMessage: (message) => { added.push(message); },
      setIsUserScrolledUp: () => undefined,
      setPendingPermissionRequests: () => undefined,
      supportsSteering: options.supportsSteering,
    }),
  );
  return { view, sent, added };
};

const queue = (content: string) => {
  writeQueuedMessage(SESSION.id, { content, options: {}, attachments: [] });
};

const keyDown = (key: string, value = '') => {
  let prevented = false;
  return {
    event: {
      key,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      currentTarget: { value },
      target: { value },
      nativeEvent: { isComposing: false },
      preventDefault: () => { prevented = true; },
    } as never,
    prevented: () => prevented,
  };
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })));
  clearQueuedMessage(SESSION.id);
  localStorage.clear();
});

afterEach(() => {
  clearQueuedMessage(SESSION.id);
  vi.unstubAllGlobals();
  localStorage.clear();
});

test('Send now steers the queued message and clears it only once accepted', () => {
  queue('also run the linter');
  const { view, sent, added } = render({ supportsSteering: true });
  assert.equal(view.result.current.queuedDraft?.content, 'also run the linter');

  act(() => { view.result.current.steerQueuedDraft(); });
  assert.deepEqual(sent.at(-1), {
    type: 'chat.steer',
    sessionId: SESSION.id,
    content: 'also run the linter',
    options: { attachments: [] },
  });
  assert.equal(view.result.current.isSteeringQueuedDraft, true);
  assert.ok(view.result.current.queuedDraft, 'the card stays until the server answers');

  act(() => { view.result.current.handleSteerResult(SESSION.id, true); });
  assert.equal(view.result.current.queuedDraft, null);
  assert.equal(view.result.current.isSteeringQueuedDraft, false);
  assert.equal(added.at(-1)?.type, 'user');
  assert.equal(added.at(-1)?.content, 'also run the linter');
});

test('a refused steer keeps the message queued for the next turn', () => {
  queue('too late');
  const { view, added } = render({ supportsSteering: true });

  act(() => { view.result.current.steerQueuedDraft(); });
  act(() => { view.result.current.handleSteerResult(SESSION.id, false); });

  assert.equal(view.result.current.queuedDraft?.content, 'too late');
  assert.equal(view.result.current.isSteeringQueuedDraft, false);
  assert.equal(added.length, 0);
});

test('a provider that cannot steer never sends chat.steer', () => {
  queue('queued');
  const { view, sent } = render({ supportsSteering: false });

  act(() => { view.result.current.steerQueuedDraft(); });
  assert.equal(sent.length, 0);
});

for (const key of ['ArrowUp', 'Escape']) {
  test(`${key} in an empty composer pulls the queued message back for editing`, () => {
    queue('edit me');
    const { view } = render({ supportsSteering: true });

    const { event, prevented } = keyDown(key);
    act(() => { view.result.current.handleKeyDown(event); });

    assert.equal(prevented(), true);
    assert.equal(view.result.current.queuedDraft, null);
    assert.equal(view.result.current.input, 'edit me');
  });
}

test('ArrowUp with text in the composer leaves the queued message alone', () => {
  queue('stay queued');
  const { view } = render({ supportsSteering: true });

  act(() => { view.result.current.handleKeyDown(keyDown('ArrowUp', 'typing').event); });
  assert.equal(view.result.current.queuedDraft?.content, 'stay queued');
});
