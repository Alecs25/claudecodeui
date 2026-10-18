import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Clock, Mic, Paperclip, Plug, PlusIcon, SquareSlash } from 'lucide-react';

import { cn } from '@/shared/utils';
import { useComposerMenuAnchor } from '@/modules/chat/hooks/useComposerMenuAnchor';
import { ComposerMenuItem, ComposerMenuSurface } from '@/modules/chat/composer/ComposerMenuPrimitives';
import { ScheduleMessagePanel } from '@/modules/chat/composer/ScheduleMessagePanel';

type ComposerPlusMenuProps = {
  onAttachFiles: () => void;
  onOpenCommands: () => void;
  /** Number of slash commands available, shown beside "Commands". */
  commandCount: number;
  /** Opens Settings at the MCP servers; absent where the chat cannot open Settings. */
  onOpenMcpSettings?: () => void;
  /** False while the box is empty: there is nothing to schedule. */
  canSchedule: boolean;
  onSchedule: (scheduledFor: Date) => void;
  /** Starts voice input; absent when voice is off or unavailable. */
  onStartVoice?: () => void;
};

const ICON_CLASS = 'h-4 w-4 text-muted-foreground';

/**
 * Rendered by chat's ChatComposer as the "+" at the start of the bar, as in
 * Claude Code: attachments, commands, connectors, scheduling and voice behind
 * one button so the bar fits a phone.
 */
export default function ComposerPlusMenu({
  onAttachFiles,
  onOpenCommands,
  commandCount,
  onOpenMcpSettings,
  canSchedule,
  onSchedule,
  onStartVoice,
}: ComposerPlusMenuProps) {
  const { t } = useTranslation('chat');
  const [isOpen, setIsOpen] = useState(false);
  // The schedule picker replaces the list inside the same popover.
  const [page, setPage] = useState<'actions' | 'schedule'>('actions');
  const close = useCallback(() => setIsOpen(false), []);
  const { triggerRef, menuRef, anchor, updateAnchor } = useComposerMenuAnchor(isOpen, close, 280, 'left');

  const runAndClose = (action: () => void) => () => {
    setIsOpen(false);
    action();
  };

  const ariaLabel = t('composer.plusMenu.label', { defaultValue: 'Add' });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          updateAnchor();
          // Every opening starts on the list, not on a schedule page left open last time.
          setPage('actions');
          setIsOpen((current) => !current);
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        title={ariaLabel}
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          isOpen && 'bg-muted text-foreground',
        )}
      >
        <PlusIcon className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-45')} />
      </button>

      {isOpen && anchor && createPortal(
        <ComposerMenuSurface anchor={anchor} menuRef={menuRef} ariaLabel={ariaLabel}>
          {page === 'schedule' ? (
            <ScheduleMessagePanel
              onSchedule={(scheduledFor) => {
                setIsOpen(false);
                onSchedule(scheduledFor);
              }}
            />
          ) : (
            <>
              <ComposerMenuItem
                role="menuitem"
                icon={<Paperclip className={ICON_CLASS} />}
                label={t('composer.plusMenu.attach', { defaultValue: 'Attach files' })}
                isSelected={false}
                onSelect={runAndClose(onAttachFiles)}
              />
              <ComposerMenuItem
                role="menuitem"
                icon={<SquareSlash className={ICON_CLASS} />}
                label={t('composer.plusMenu.commands', { defaultValue: 'Commands' })}
                isSelected={false}
                onSelect={runAndClose(onOpenCommands)}
                trailing={commandCount > 0
                  ? <span className="text-[11px] tabular-nums text-muted-foreground">{commandCount}</span>
                  : undefined}
              />
              {onOpenMcpSettings && (
                <ComposerMenuItem
                  role="menuitem"
                  icon={<Plug className={ICON_CLASS} />}
                  label={t('composer.plusMenu.mcp', { defaultValue: 'MCP connectors' })}
                  isSelected={false}
                  onSelect={runAndClose(onOpenMcpSettings)}
                />
              )}
              <ComposerMenuItem
                role="menuitem"
                icon={<Clock className={ICON_CLASS} />}
                label={t('composer.plusMenu.schedule', { defaultValue: 'Schedule message' })}
                isSelected={false}
                disabled={!canSchedule}
                onSelect={() => setPage('schedule')}
              />
              {onStartVoice && (
                <ComposerMenuItem
                  role="menuitem"
                  icon={<Mic className={ICON_CLASS} />}
                  label={t('composer.plusMenu.voice', { defaultValue: 'Voice' })}
                  isSelected={false}
                  onSelect={runAndClose(onStartVoice)}
                />
              )}
            </>
          )}
        </ComposerMenuSurface>,
        document.body,
      )}
    </>
  );
}
