import { OPEN_SIDE_CHAT_EVENT } from '@/shared/constants';
import type { OpenSideChatDetail } from '@/shared/types';

/**
 * Side chat ("/btw", Ctrl+;): a question that reads the session's context
 * without becoming part of it. The server answers from a forked, unpersisted
 * copy of the conversation, so the main transcript never sees it.
 */

const BTW_COMMAND = '/btw';

/** Opens the side chat; the host mounted by the project workspace picks it up. */
export const requestSideChat = (detail: OpenSideChatDetail = {}): void => {
  window.dispatchEvent(new CustomEvent<OpenSideChatDetail>(OPEN_SIDE_CHAT_EVENT, { detail }));
};

/**
 * The question of a `/btw <question>` input: `''` for a bare `/btw`, null when
 * the input is not the command (so `/btwx` stays an ordinary message).
 */
export const readBtwQuestion = (input: string): string | null => {
  const text = input.trim();
  if (text !== BTW_COMMAND && !new RegExp(`^${BTW_COMMAND}\\s`).test(text)) {
    return null;
  }
  return text.slice(BTW_COMMAND.length).trim();
};

/** Ctrl+; (Cmd+; on macOS), the side chat shortcut of Claude Code. */
export const isSideChatShortcut = (event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): boolean =>
  event.key === ';' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
