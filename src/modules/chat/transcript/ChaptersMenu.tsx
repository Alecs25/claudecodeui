import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ListTree, X } from 'lucide-react';

import type { ChatMessage } from '@/shared/types';
import { cn } from '@/shared/utils';
import { getChapterAnchorId, listChapters, type TranscriptChapter } from '@/modules/chat/utils/chapters';

type ChaptersMenuProps = {
  /** Every loaded row of the session, not the visible window: a chapter pages up is still listed. */
  messages: ChatMessage[];
  /** Brings a row into view, widening the visible window and mounting lazy rows as needed. */
  onReveal: (message: ChatMessage) => void;
  /** True while older pages are not loaded, so earlier chapters may be missing from the list. */
  hasUnloadedHistory?: boolean;
  onLoadAll?: () => void;
};

const DESKTOP_PANEL_WIDTH = 288;
const MOBILE_QUERY = '(max-width: 639px)';
// A chapter in a lazy row only gets its divider once the row mounts near the
// viewport, which can take the whole smooth scroll; ~1.5 s of frames covers it.
const ANCHOR_SEARCH_FRAMES = 90;

const isMobileViewport = () => typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia(MOBILE_QUERY).matches;

/** Lands on the divider itself once it is in the DOM; revealMessage alone centres the nearest row with that timestamp. */
function scrollToChapterAnchor(anchorId: string) {
  let remaining = ANCHOR_SEARCH_FRAMES;
  const attempt = () => {
    const element = document.getElementById(anchorId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    remaining -= 1;
    if (remaining > 0) {
      requestAnimationFrame(attempt);
    }
  };
  requestAnimationFrame(attempt);
}

/**
 * Rendered by chat's ChatMessagesPane header: the table of contents of the
 * chapters the agent marked with mark_chapter. A popover on desktop, a bottom
 * sheet on phones. Renders nothing until the session has a chapter.
 */
function ChaptersMenu({ messages, onReveal, hasUnloadedHistory = false, onLoadAll }: ChaptersMenuProps) {
  const { t } = useTranslation('chat');
  const chapters = useMemo(() => listChapters(messages), [messages]);
  const [isOpen, setIsOpen] = useState(false);
  const [layout, setLayout] = useState<{ mobile: boolean; top: number; left: number }>({ mobile: false, top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        close();
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', close);
    };
  }, [isOpen, close]);

  if (chapters.length === 0) {
    return null;
  }

  const toggle = () => {
    if (isOpen) {
      close();
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    setLayout({
      mobile: isMobileViewport(),
      top: rect ? rect.bottom + 6 : 8,
      left: rect ? Math.max(8, Math.min(rect.right - DESKTOP_PANEL_WIDTH, window.innerWidth - DESKTOP_PANEL_WIDTH - 8)) : 8,
    });
    setIsOpen(true);
  };

  const jumpTo = (chapter: TranscriptChapter) => {
    close();
    onReveal(chapter.message);
    scrollToChapterAnchor(getChapterAnchorId(chapter.message));
  };

  const label = t('chapters.title', { defaultValue: 'Chapters' });

  const panel = isOpen && (
    <>
      {layout.mobile && <div className="fixed inset-0 z-[69] bg-black/30" aria-hidden onClick={close} />}
      <div
        ref={panelRef}
        role="dialog"
        aria-label={label}
        data-escape-layer
        className={cn(
          'fixed z-[70] border border-border bg-popover text-popover-foreground shadow-xl',
          layout.mobile
            ? 'inset-x-0 bottom-0 max-h-[70vh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]'
            : 'max-h-[60vh] rounded-xl',
        )}
        style={layout.mobile ? undefined : { top: layout.top, left: layout.left, width: DESKTOP_PANEL_WIDTH }}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-xs font-medium text-foreground">{label}</p>
          {layout.mobile && (
            <button
              type="button"
              onClick={close}
              aria-label={t('chapters.close', { defaultValue: 'Close' })}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <ol className={cn('overflow-y-auto p-1.5', layout.mobile ? 'max-h-[calc(70vh-3rem)]' : 'max-h-[calc(60vh-3rem)]')}>
          {hasUnloadedHistory && onLoadAll && (
            <li>
              <button
                type="button"
                onClick={() => { close(); onLoadAll(); }}
                className="w-full rounded-md px-3 py-2 text-left text-xs text-blue-600 hover:bg-accent dark:text-blue-400"
              >
                {t('chapters.loadEarlier', { defaultValue: 'Load earlier chapters' })}
              </button>
            </li>
          )}
          {chapters.map((chapter, index) => (
            <li key={getChapterAnchorId(chapter.message)}>
              <button
                type="button"
                onClick={() => jumpTo(chapter)}
                className="flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left text-sm hover:bg-accent focus:outline-none focus-visible:bg-accent"
              >
                <span className="mt-0.5 w-4 flex-shrink-0 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium leading-5">{chapter.title}</span>
                  {chapter.summary && (
                    <span className="mt-0.5 block truncate text-xs leading-4 text-muted-foreground">{chapter.summary}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="flex h-8 items-center gap-1 rounded-lg border border-border/50 bg-background/95 px-2 text-xs text-muted-foreground backdrop-blur hover:bg-accent hover:text-foreground"
      >
        <ListTree className="h-4 w-4" />
        <span className="tabular-nums">{chapters.length}</span>
      </button>
      {typeof document !== 'undefined' && panel ? createPortal(panel, document.body) : null}
    </>
  );
}

export default memo(ChaptersMenu);
