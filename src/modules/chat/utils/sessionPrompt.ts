/**
 * Window event the composer listens to: something outside the chat (the
 * Changes pane's "Send to Claude") asks to send a message to one session as
 * if the user had typed it. Carries the session id because a split view has
 * two composers mounted and only the matching one may send.
 */
export const SESSION_PROMPT_EVENT = 'cloudcli:send-session-prompt';

export type SessionPromptDetail = {
  sessionId: string;
  text: string;
};

export const requestSessionPrompt = (sessionId: string, text: string): void => {
  const prompt = text.trim();
  if (!sessionId || !prompt) {
    return;
  }
  window.dispatchEvent(new CustomEvent<SessionPromptDetail>(SESSION_PROMPT_EVENT, { detail: { sessionId, text: prompt } }));
};

export const readSessionPromptDetail = (event: Event): SessionPromptDetail | null => {
  const detail = (event as CustomEvent<Partial<SessionPromptDetail> | undefined>).detail;
  if (!detail || typeof detail.sessionId !== 'string' || typeof detail.text !== 'string' || !detail.text.trim()) {
    return null;
  }
  return { sessionId: detail.sessionId, text: detail.text };
};
