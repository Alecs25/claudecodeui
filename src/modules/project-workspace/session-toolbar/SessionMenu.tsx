import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  Braces,
  Brain,
  CheckCircle2,
  Columns2,
  MessageSquarePlus,
  MessageSquareText,
  Pencil,
  Pin,
  PinOff,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@/shared/ui';
import { cn } from '@/shared/utils';
import { TRANSCRIPT_VIEW_MODES, type TranscriptViewMode } from '@/shared/uiPreferences';

/** Fired by the menu's "Side chat"; the side-chat module listens for it. */
export const OPEN_SIDE_CHAT_EVENT = 'cloudcli:open-side-chat';

const VIEW_MODE_ICONS: Record<TranscriptViewMode, LucideIcon> = {
  normal: MessageSquareText,
  thinking: Brain,
  verbose: Braces,
};

const VIEW_MODE_DEFAULT_LABELS: Record<TranscriptViewMode, string> = {
  normal: 'Normal',
  thinking: 'Thinking',
  verbose: 'Verbose',
};

export type SessionMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMobile: boolean;
  sessionId: string;
  sessionTitle: string;
  isPinned: boolean;
  isCompleted: boolean;
  viewMode?: TranscriptViewMode;
  onViewModeChange?: (mode: TranscriptViewMode) => void;
  onRename: () => void;
  onTogglePinned: () => void;
  onToggleCompleted: () => void;
  onArchive: () => void;
  /** Absent below the split breakpoint, where there is no room for a second session. */
  split?: { isOpen: boolean; canOpen: boolean; onToggle: () => void };
};

type MenuEntry = {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  hint?: string;
  disabled?: boolean;
  isDanger?: boolean;
  dividerBefore?: boolean;
};

/**
 * Rendered by WorkspaceTitle under the session title: the session's own
 * actions, as a popover from 768px and a bottom sheet on a phone. The same
 * items the title's caret opens in Claude Code, plus the transcript view that
 * used to sit over the chat.
 */
export default function SessionMenu({
  open,
  onOpenChange,
  isMobile,
  sessionId,
  sessionTitle,
  isPinned,
  isCompleted,
  viewMode,
  onViewModeChange,
  onRename,
  onTogglePinned,
  onToggleCompleted,
  onArchive,
  split,
}: SessionMenuProps) {
  const { t } = useTranslation();
  const popoverRef = useRef<HTMLDivElement>(null);

  const close = () => onOpenChange(false);
  const runAndClose = (action: () => void) => () => {
    close();
    action();
  };

  const entries: MenuEntry[] = [
    { key: 'rename', label: t('sessionMenu.rename', { defaultValue: 'Rename' }), icon: Pencil, onSelect: runAndClose(onRename) },
    {
      key: 'pin',
      label: isPinned ? t('sessionMenu.unpin', { defaultValue: 'Unpin' }) : t('sessionMenu.pin', { defaultValue: 'Pin' }),
      icon: isPinned ? PinOff : Pin,
      onSelect: runAndClose(onTogglePinned),
    },
  ];
  const afterViewEntries: MenuEntry[] = [
    {
      key: 'side-chat',
      label: t('sessionMenu.sideChat', { defaultValue: 'Side chat' }),
      icon: MessageSquarePlus,
      hint: '/btw',
      onSelect: runAndClose(() => {
        window.dispatchEvent(new CustomEvent(OPEN_SIDE_CHAT_EVENT, { detail: { sessionId } }));
      }),
    },
    {
      key: 'completed',
      label: isCompleted
        ? t('sessionMenu.reopen', { defaultValue: 'Reopen' })
        : t('sessionMenu.markCompleted', { defaultValue: 'Mark completed' }),
      icon: isCompleted ? RotateCcw : CheckCircle2,
      onSelect: runAndClose(onToggleCompleted),
    },
    ...(split ? [{
      key: 'split',
      label: split.isOpen
        ? t('sessionMenu.closeSplit', { defaultValue: 'Close side by side' })
        : t('sessionMenu.openSplit', { defaultValue: 'Open side by side' }),
      icon: Columns2,
      disabled: !split.isOpen && !split.canOpen,
      onSelect: runAndClose(split.onToggle),
    }] : []),
    {
      key: 'archive',
      label: t('sessionMenu.archive', { defaultValue: 'Archive' }),
      icon: Archive,
      isDanger: true,
      dividerBefore: true,
      onSelect: runAndClose(onArchive),
    },
  ];

  useEffect(() => {
    if (!open || isMobile) {
      return undefined;
    }
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node;
      // The trigger toggles by itself; closing here too would reopen it.
      if (popoverRef.current?.contains(target) || popoverRef.current?.parentElement?.contains(target)) {
        return;
      }
      onOpenChange(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMobile, onOpenChange, open]);

  if (!open) {
    return null;
  }

  const renderEntry = (entry: MenuEntry): ReactNode => (
    <div key={entry.key}>
      {entry.dividerBefore && <div className="mx-2 my-1 h-px bg-border" />}
      <button
        type="button"
        role="menuitem"
        disabled={entry.disabled}
        onClick={entry.onSelect}
        className={cn(
          'flex w-full items-center gap-3 rounded-md px-3 text-left text-sm transition-colors focus:outline-none focus-visible:bg-accent',
          isMobile ? 'min-h-11' : 'min-h-9',
          entry.disabled
            ? 'cursor-not-allowed opacity-50'
            : entry.isDanger
              ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950'
              : 'hover:bg-accent',
        )}
      >
        <entry.icon className="h-4 w-4 flex-shrink-0" />
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
        {entry.hint && <kbd className="font-mono text-[10px] text-muted-foreground">{entry.hint}</kbd>}
      </button>
    </div>
  );

  const viewRow = viewMode && onViewModeChange ? (
    <div className="px-3 py-1.5" role="group" aria-label={t('sessionMenu.view', { defaultValue: 'View' })}>
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>{t('sessionMenu.view', { defaultValue: 'View' })}</span>
        <kbd className="font-mono text-[10px]">Ctrl O</kbd>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/60 p-0.5">
        {TRANSCRIPT_VIEW_MODES.map((mode) => {
          const Icon = VIEW_MODE_ICONS[mode];
          const isActive = mode === viewMode;
          return (
            <button
              key={mode}
              type="button"
              role="menuitemradio"
              aria-checked={isActive}
              // Picking a view keeps the menu open, so the effect shows behind it.
              onClick={() => onViewModeChange(mode)}
              className={cn(
                'flex items-center justify-center gap-1 rounded-md px-1.5 text-xs transition-colors',
                isMobile ? 'min-h-10' : 'min-h-8',
                isActive ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{t(`chat:viewMode.${mode}`, { defaultValue: VIEW_MODE_DEFAULT_LABELS[mode] })}</span>
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  const body = (
    <div role="menu" aria-label={t('sessionMenu.title', { defaultValue: 'Session options' })}>
      {entries.map(renderEntry)}
      {viewRow}
      {afterViewEntries.map(renderEntry)}
    </div>
  );

  if (isMobile) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent
          animationClassName="animate-bottom-sheet-content-show motion-reduce:animate-none"
          className="bottom-0 left-0 top-auto max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-2xl border-x-0 border-b-0 px-3 pb-safe-area-inset-bottom pt-3"
        >
          <DialogTitle>{t('sessionMenu.title', { defaultValue: 'Session options' })}</DialogTitle>
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />
          <p className="mb-2 truncate px-3 text-sm font-medium text-foreground">{sessionTitle}</p>
          {body}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div
      ref={popoverRef}
      data-escape-layer
      className="animate-in fade-in-0 zoom-in-95 absolute left-0 top-full z-50 mt-1.5 w-72 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
    >
      {body}
    </div>
  );
}
