import { useCallback, useEffect, useRef, useState } from 'react';

import { useWebSocket } from '@/shared/context/WebSocketContext';
import type { ServerEvent, SideChatEntry } from '@/shared/types';

type OpenSideChat = {
  sideChatId: string;
  sessionId: string;
};

// crypto.randomUUID only exists in secure contexts, and CloudCLI is often
// reached over plain http on a LAN address. The id only has to be unique among
// this browser's side chats.
const createLocalId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Folds one `side_chat` frame into the transcript. Exported for tests. */
export function applySideChatEvent(entries: SideChatEntry[], event: ServerEvent): SideChatEntry[] {
  const last = entries[entries.length - 1];
  const answer: SideChatEntry = last?.role === 'assistant'
    ? { ...last, tools: [...last.tools] }
    : { id: createLocalId(), role: 'assistant', text: '', tools: [] };
  const withAnswer = (next: SideChatEntry) => (last?.role === 'assistant'
    ? [...entries.slice(0, -1), next]
    : [...entries, next]);

  if (event.event === 'text' && typeof event.text === 'string') {
    return withAnswer({ ...answer, text: answer.text ? `${answer.text}\n\n${event.text}` : event.text });
  }
  if (event.event === 'tool' && typeof event.name === 'string') {
    const detail = typeof event.detail === 'string' && event.detail ? ` ${event.detail}` : '';
    return withAnswer({ ...answer, tools: [...answer.tools, `${event.name}${detail}`] });
  }
  if (event.event === 'error') {
    return withAnswer({ ...answer, error: typeof event.error === 'string' ? event.error : 'Error' });
  }
  return entries;
}

/**
 * State of the one side chat this tab shows. Closing it tells the server to
 * end the forked process, which discards the side conversation.
 */
export function useSideChat() {
  const { sendMessage, subscribe } = useWebSocket();
  // The side chat on screen: its id routes `side_chat` frames here, the
  // session id says whose context it reads. Null while closed.
  const [openChat, setOpenChat] = useState<OpenSideChat | null>(null);
  // The side transcript; it lives only as long as the panel.
  const [entries, setEntries] = useState<SideChatEntry[]>([]);
  // An answer is on its way: disables sending and shows the activity row.
  const [isAnswering, setIsAnswering] = useState(false);
  const openChatRef = useRef<OpenSideChat | null>(null);
  openChatRef.current = openChat;

  useEffect(() => subscribe((event) => {
    if (event.kind !== 'side_chat' || event.sideChatId !== openChatRef.current?.sideChatId) {
      return;
    }
    if (event.event === 'done' || event.event === 'error') {
      setIsAnswering(false);
    }
    setEntries((previous) => applySideChatEvent(previous, event));
  }), [subscribe]);

  const close = useCallback(() => {
    const current = openChatRef.current;
    if (current) {
      sendMessage({ type: 'chat.side-close', sideChatId: current.sideChatId });
    }
    openChatRef.current = null;
    setOpenChat(null);
    setEntries([]);
    setIsAnswering(false);
  }, [sendMessage]);

  const ask = useCallback((text: string, chat: OpenSideChat | null = openChatRef.current) => {
    const question = text.trim();
    if (!question || !chat) {
      return;
    }
    setEntries((previous) => [...previous, { id: createLocalId(), role: 'user', text: question, tools: [] }]);
    setIsAnswering(true);
    sendMessage({ type: 'chat.side-question', sideChatId: chat.sideChatId, sessionId: chat.sessionId, text: question });
  }, [sendMessage]);

  const open = useCallback((sessionId: string, question?: string) => {
    let chat = openChatRef.current;
    // A side chat belongs to one session: asking about another starts over.
    if (chat && chat.sessionId !== sessionId) {
      close();
      chat = null;
    }
    if (!chat) {
      chat = { sideChatId: createLocalId(), sessionId };
      openChatRef.current = chat;
      setOpenChat(chat);
    }
    if (question) {
      ask(question, chat);
    }
  }, [ask, close]);

  // Unmounting (leaving the workspace) ends the side chat like closing it.
  // Through a ref, so a new `sendMessage` identity never counts as an unmount.
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;
  useEffect(() => () => {
    const current = openChatRef.current;
    if (current) {
      sendMessageRef.current({ type: 'chat.side-close', sideChatId: current.sideChatId });
    }
  }, []);

  return { isOpen: openChat !== null, entries, isAnswering, open, ask, close };
}
