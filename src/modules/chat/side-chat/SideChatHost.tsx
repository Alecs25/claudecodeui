import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MessagesSquare, SendHorizontal, X } from 'lucide-react';

import { Markdown } from '@/modules/chat/transcript/Markdown';
import { useSideChat } from '@/modules/chat/hooks/useSideChat';
import { isSideChatShortcut } from '@/modules/chat/utils/sideChat';
import { OPEN_SIDE_CHAT_EVENT } from '@/shared/constants';
import type { OpenSideChatDetail } from '@/shared/types';
import { Button } from '@/shared/ui';

type SideChatHostProps = {
  /** The session on screen: what Ctrl+; and an event without a session id ask about. */
  activeSessionId: string | null;
};

/**
 * Used by the project-workspace module, mounted once beside the main region:
 * the side chat panel, opened by OPEN_SIDE_CHAT_EVENT (/btw, the session menu)
 * or Ctrl+;. A right pane from 768px, a bottom sheet on phones. Closing it
 * discards the side conversation.
 */
export function SideChatHost({ activeSessionId }: SideChatHostProps) {
  const { t } = useTranslation('chat');
  const { isOpen, entries, isAnswering, open, ask, close } = useSideChat();
  // The question being typed in the panel's own input.
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  const openFor = useCallback((detail: OpenSideChatDetail) => {
    const sessionId = detail.sessionId || activeSessionIdRef.current;
    if (!sessionId) {
      return;
    }
    open(sessionId, detail.question?.trim() || undefined);
    // After the panel renders, so the input exists.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    const handleOpen = (event: Event) => openFor((event as CustomEvent<OpenSideChatDetail>).detail ?? {});
    window.addEventListener(OPEN_SIDE_CHAT_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_SIDE_CHAT_EVENT, handleOpen);
  }, [openFor]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isSideChatShortcut(event)) {
        return;
      }
      event.preventDefault();
      if (isOpen) {
        close();
      } else {
        openFor({});
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [close, isOpen, openFor]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) {
      transcript.scrollTop = transcript.scrollHeight;
    }
  }, [entries, isAnswering]);

  const handleClose = useCallback(() => {
    setDraft('');
    close();
  }, [close]);

  const submit = useCallback((event?: FormEvent) => {
    event?.preventDefault();
    if (isAnswering || !draft.trim()) {
      return;
    }
    ask(draft);
    setDraft('');
  }, [ask, draft, isAnswering]);

  const handleInputKeyDown = useCallback((event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      handleClose();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      submit(event);
    }
  }, [handleClose, submit]);

  if (!isOpen) {
    return null;
  }

  return (
    <aside
      role="dialog"
      aria-label={t('sideChat.title', { defaultValue: 'Side chat' })}
      className="fixed inset-x-0 z-50 flex h-[70dvh] flex-col rounded-t-2xl border-t border-border bg-background shadow-2xl md:inset-x-auto md:right-0 md:top-0 md:h-auto md:w-[400px] md:rounded-none md:border-l md:border-t-0"
      style={{ bottom: 'var(--keyboard-height, 0px)' }}
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessagesSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{t('sideChat.title', { defaultValue: 'Side chat' })}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {t('sideChat.notSaved', { defaultValue: 'Not added to the session' })}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleClose}
          aria-label={t('sideChat.close', { defaultValue: 'Close' })}
        >
          <X />
        </Button>
      </header>

      <div ref={transcriptRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {entries.length === 0 && (
          <p className="pt-6 text-center text-sm text-muted-foreground">
            {t('sideChat.empty', { defaultValue: 'Ask about this session' })}
          </p>
        )}
        {entries.map((entry) => (entry.role === 'user' ? (
          <div key={entry.id} className="flex justify-end">
            <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-3 py-2 text-sm">
              {entry.text}
            </div>
          </div>
        ) : (
          <div key={entry.id} className="space-y-1">
            {entry.tools.map((tool, index) => (
              <p key={`${tool}-${index}`} className="truncate font-mono text-xs text-muted-foreground" title={tool}>
                {tool}
              </p>
            ))}
            {entry.text && (
              <Markdown className="prose prose-sm max-w-none dark:prose-invert">{entry.text}</Markdown>
            )}
            {entry.error && (
              <p className="text-sm text-destructive">{entry.error}</p>
            )}
          </div>
        )))}
        {isAnswering && (
          <p className="animate-pulse text-xs text-muted-foreground">
            {t('sideChat.answering', { defaultValue: 'Answering…' })}
          </p>
        )}
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 border-t border-border p-3">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleInputKeyDown}
          rows={2}
          placeholder={t('sideChat.placeholder', { defaultValue: 'Ask a side question' })}
          className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          type="submit"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-xl"
          disabled={isAnswering || !draft.trim()}
          aria-label={t('sideChat.send', { defaultValue: 'Send' })}
        >
          <SendHorizontal />
        </Button>
      </form>
    </aside>
  );
}
