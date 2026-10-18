import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import '@/modules/i18n';
import { applySideChatEvent } from '@/modules/chat/hooks/useSideChat';
import { SideChatHost } from '@/modules/chat/side-chat/SideChatHost';
import { isSideChatShortcut, readBtwQuestion, requestSideChat } from '@/modules/chat/utils/sideChat';
import type { ServerEvent } from '@/shared/types';

const socket = vi.hoisted(() => ({
  sent: [] as any[],
  listeners: new Set<(event: any) => void>(),
}));

vi.mock('@/shared/context/WebSocketContext', () => ({
  useWebSocket: () => ({
    sendMessage: (message: unknown) => socket.sent.push(message),
    subscribe: (listener: (event: any) => void) => {
      socket.listeners.add(listener);
      return () => socket.listeners.delete(listener);
    },
  }),
}));

const emit = (event: ServerEvent) => act(() => {
  socket.listeners.forEach((listener) => listener(event));
});

describe('side chat', () => {
  beforeEach(() => {
    socket.sent.length = 0;
  });

  it('reads /btw questions and nothing else', () => {
    expect(readBtwQuestion('/btw why is this slow?')).toBe('why is this slow?');
    expect(readBtwQuestion('  /btw  ')).toBe('');
    expect(readBtwQuestion('/btwx')).toBeNull();
    expect(readBtwQuestion('tell me /btw')).toBeNull();
    expect(isSideChatShortcut({ key: ';', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe(true);
    expect(isSideChatShortcut({ key: ';', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })).toBe(false);
  });

  it('folds answer events into one assistant entry', () => {
    let entries = applySideChatEvent([{ id: 'u', role: 'user', text: 'q', tools: [] }], { event: 'tool', name: 'Read', detail: '/a.ts' });
    entries = applySideChatEvent(entries, { event: 'text', text: 'Because.' });
    entries = applySideChatEvent(entries, { event: 'done' });
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({ role: 'assistant', text: 'Because.', tools: ['Read /a.ts'] });
  });

  it('asks the session given by the event, shows the answer and discards it on close', () => {
    render(<SideChatHost activeSessionId="current" />);
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => requestSideChat({ sessionId: 's1', question: 'what changed?' }));
    expect(screen.getByRole('dialog', { name: 'Side chat' })).toBeTruthy();
    expect(socket.sent).toHaveLength(1);
    const [question] = socket.sent;
    expect(question).toMatchObject({ type: 'chat.side-question', sessionId: 's1', text: 'what changed?' });

    emit({ kind: 'side_chat', sideChatId: 'someone-else', event: 'text', text: 'not mine' });
    emit({ kind: 'side_chat', sideChatId: question.sideChatId, event: 'text', text: 'Two files.' });
    emit({ kind: 'side_chat', sideChatId: question.sideChatId, event: 'done' });
    expect(screen.getByText('Two files.')).toBeTruthy();
    expect(screen.queryByText('not mine')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(socket.sent[1]).toEqual({ type: 'chat.side-close', sideChatId: question.sideChatId });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens on Ctrl+; for the session on screen and sends follow-ups to the same side chat', () => {
    render(<SideChatHost activeSessionId="current" />);
    act(() => {
      fireEvent.keyDown(window, { key: ';', ctrlKey: true });
    });
    const input = screen.getByPlaceholderText('Ask a side question');
    fireEvent.change(input, { target: { value: 'first' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(socket.sent[0]).toMatchObject({ type: 'chat.side-question', sessionId: 'current', text: 'first' });

    emit({ kind: 'side_chat', sideChatId: socket.sent[0].sideChatId, event: 'done' });
    fireEvent.change(input, { target: { value: 'second' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(socket.sent[1]).toMatchObject({ sideChatId: socket.sent[0].sideChatId, text: 'second' });
  });
});
