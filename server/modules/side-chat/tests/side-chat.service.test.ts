import assert from 'node:assert/strict';
import test from 'node:test';

import type { WebSocket } from 'ws';

import { sideChatService } from '@/modules/side-chat/side-chat.service.js';

function fakeSocket() {
  const frames: any[] = [];
  return { frames, ws: { readyState: 1, send: (raw: string) => frames.push(JSON.parse(raw)) } as unknown as WebSocket };
}

function fakeStart() {
  const started: any[] = [];
  const start = (input: any) => {
    const chat = { questions: [] as string[], closed: false, input };
    started.push(chat);
    return {
      ask: (text: string) => {
        chat.questions.push(text);
        return !chat.closed;
      },
      close: () => {
        chat.closed = true;
      },
    };
  };
  return { started, start };
}

const claudeSession = {
  provider: 'claude',
  provider_session_id: 'provider-1',
  project_path: '/projects/app',
  model: 'opus',
} as any;

test('the first question opens a fork of the session and later ones reuse it', () => {
  const { ws, frames } = fakeSocket();
  const { started, start } = fakeStart();
  const dependencies = { getSession: () => claudeSession, start } as any;

  sideChatService.ask(ws, { sideChatId: 'side-1', sessionId: 's1', text: 'why?' }, dependencies);
  sideChatService.ask(ws, { sideChatId: 'side-1', sessionId: 's1', text: 'and then?' }, dependencies);

  assert.equal(started.length, 1);
  assert.equal(started[0].input.providerSessionId, 'provider-1');
  assert.equal(started[0].input.cwd, '/projects/app');
  assert.deepEqual(started[0].questions, ['why?', 'and then?']);

  started[0].input.onEvent({ event: 'text', text: 'because' });
  assert.deepEqual(frames, [{ kind: 'side_chat', sideChatId: 'side-1', event: 'text', text: 'because' }]);

  sideChatService.close(ws, { sideChatId: 'side-1' });
  assert.equal(started[0].closed, true);
  assert.equal(sideChatService.count(), 0);
});

test('a side chat is refused for other providers and sessions without a transcript', () => {
  const { ws, frames } = fakeSocket();
  const { started, start } = fakeStart();

  sideChatService.ask(ws, { sideChatId: 'a', sessionId: 's', text: 'q' }, { getSession: () => ({ ...claudeSession, provider: 'codex' }), start } as any);
  sideChatService.ask(ws, { sideChatId: 'b', sessionId: 's', text: 'q' }, { getSession: () => ({ ...claudeSession, provider_session_id: null }), start } as any);

  assert.equal(started.length, 0);
  assert.deepEqual(frames.map((frame) => frame.code), ['UNSUPPORTED_PROVIDER', 'SESSION_NOT_READY']);
});

test('another socket cannot use a side chat, and a closed socket ends its own', () => {
  const owner = fakeSocket();
  const other = fakeSocket();
  const { started, start } = fakeStart();
  const dependencies = { getSession: () => claudeSession, start } as any;

  sideChatService.ask(owner.ws, { sideChatId: 'side-2', sessionId: 's1', text: 'q' }, dependencies);
  sideChatService.ask(other.ws, { sideChatId: 'side-2', sessionId: 's1', text: 'hijack' }, dependencies);
  assert.deepEqual(started[0].questions, ['q']);
  assert.equal(other.frames[0].code, 'SIDE_CHAT_MISMATCH');

  sideChatService.close(other.ws, { sideChatId: 'side-2' });
  assert.equal(started[0].closed, false);

  sideChatService.closeAllFor(owner.ws);
  assert.equal(started[0].closed, true);
  assert.equal(sideChatService.count(), 0);
});
