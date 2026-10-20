import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { Archive, Check, CheckSquare, ChevronRight, CircleCheck, Hand, Loader2, Square, X } from 'lucide-react';
import type { TFunction } from 'i18next';

import { LLMProviderLogo } from '@/shared/ui';
import { cn } from '@/shared/utils';
import type { LLMProvider, ProjectSession, SessionStatusPatch, SessionWithProvider } from '@/shared/types';
import { createSessionViewModel, formatCompactAge } from '@/modules/sidebar/utils/sidebarProjectFormatting';
import { useLongPress } from '@/modules/sidebar/hooks/useLongPress';
import SessionActionsSheet from '@/modules/sidebar/SessionActionsSheet';
import SessionOptions from '@/modules/sidebar/SessionOptions';

type SidebarSessionItemProps = {
  /** The owning project, or null for a recents row whose project the server could not resolve. */
  projectId: string | null;
  /** The project's name for the menu header; the grouped list leaves it out, the group says it. */
  projectLabel?: string;
  session: SessionWithProvider;
  selectedSession: ProjectSession | null;
  isProcessing: boolean;
  /** The session's turn has ended but the agents, workflows or commands it launched still run. */
  hasBackgroundWork: boolean;
  /** Activity arrived while the user was looking elsewhere; drawn like an unread session. */
  needsAttention: boolean;
  /** A permission or question prompt is open in the session. */
  isWaiting: boolean;
  currentTime: Date;
  /** Resolved for this row, so a keystroke elsewhere does not invalidate it. */
  isEditing: boolean;
  renameDraft: string;
  onRenameDraftChange: (draft: string) => void;
  onStartEditingSession: (projectId: string, sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectId: string, sessionId: string, summary: string, provider: LLMProvider) => void;
  /** Takes the projectId (empty when unknown) so this memoized row binds itself without a per-row closure. */
  onSessionSelect: (session: SessionWithProvider, projectId: string) => void;
  onDeleteSession: (sessionId: string, sessionTitle: string) => void;
  onArchiveSession?: (sessionId: string) => void;
  /** Branches this session into an independent one; absent when its provider cannot. */
  onForkSession?: (session: SessionWithProvider) => void;
  onSetSessionStatus: (sessionId: string, patch: SessionStatusPatch) => void;
  /** Opens this session in the second pane; absent where split view is unavailable. */
  onOpenInSplitView?: (session: SessionWithProvider) => void;
  /** This project's list is in bulk-selection mode: the row acts as a checkbox and hides its actions. */
  isSelecting?: boolean;
  /** Ticked for the pending bulk delete. Resolved by the list, which never ticks a running row. */
  isChecked?: boolean;
  onToggleSessionSelected?: (projectId: string, sessionId: string) => void;
  /** Sessions nested under this row in a project group; 0 or absent = no fold toggle. */
  childCount?: number;
  areChildrenExpanded?: boolean;
  onToggleChildren?: (sessionId: string) => void;
  t: TFunction;
};

type RowStatus = 'waiting' | 'processing' | 'background' | 'unread' | 'completed' | 'none';

/**
 * The one icon slot at the row's left edge. Same meaning in every list:
 * spinner = responding, amber hand = a prompt is open, purple dot = only
 * background work left, blue dot = not read yet, grey check = completed.
 */
function SessionStatusIcon({ status, t }: { status: RowStatus; t: TFunction }) {
  if (status === 'waiting') {
    const label = t('tooltips.waitingSessionIndicator', { defaultValue: 'Waiting for permission' });
    return <Hand role="status" aria-label={label} className="h-3.5 w-3.5 text-amber-500" />;
  }
  if (status === 'processing') {
    return (
      <Loader2
        aria-label={t('tooltips.processingSessionIndicator', { defaultValue: 'Processing session' })}
        className="h-3.5 w-3.5 animate-spin text-muted-foreground"
      />
    );
  }
  if (status === 'background') {
    const label = t('tooltips.backgroundWorkIndicator', { defaultValue: 'Background work running' });
    return <span role="status" aria-label={label} title={label} className="h-2 w-2 animate-pulse rounded-full bg-purple-500 dark:bg-purple-400" />;
  }
  if (status === 'unread') {
    const label = t('tooltips.unreadSessionIndicator', { defaultValue: 'Unread' });
    return <span role="status" aria-label={label} title={label} className="h-2 w-2 rounded-full bg-blue-500" />;
  }
  if (status === 'completed') {
    return (
      <CircleCheck
        aria-label={t('sessionStatus.completed', { defaultValue: 'Completed' })}
        className="h-3.5 w-3.5 text-muted-foreground/70"
      />
    );
  }
  return null;
}

/**
 * The session row of every sidebar list — project groups, pinned section and
 * the flat recents list — on phone and tablet alike: status icon, title,
 * age. Its actions live in the "…" menu (hover or right-click with a mouse) and
 * in a bottom sheet (long press on touch), never in always-visible buttons.
 */
function SidebarSessionItem({
  projectId,
  projectLabel,
  session,
  selectedSession,
  isProcessing,
  hasBackgroundWork,
  needsAttention,
  isWaiting,
  currentTime,
  isEditing,
  renameDraft,
  onRenameDraftChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  onSessionSelect,
  onDeleteSession,
  onArchiveSession,
  onForkSession,
  onSetSessionStatus,
  onOpenInSplitView,
  isSelecting = false,
  isChecked = false,
  onToggleSessionSelected,
  childCount = 0,
  areChildrenExpanded = true,
  onToggleChildren,
  t,
}: SidebarSessionItemProps) {
  const sessionView = createSessionViewModel(session, currentTime, t);
  const isSelected = selectedSession?.id === session.id;
  const age = formatCompactAge(sessionView.sessionTime, currentTime);
  // The long-press sheet; mounted only while open.
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const status: RowStatus = isWaiting
    ? 'waiting'
    : isProcessing
      ? 'processing'
      : hasBackgroundWork
        ? 'background'
        : (session.isUnread || needsAttention) && !isSelected
          ? 'unread'
          : session.isCompleted
            ? 'completed'
            : 'none';

  // A running session cannot be deleted, so it cannot be ticked either; the row
  // still renders, locked, instead of disappearing from the list mid-selection.
  const isSelectable = isSelecting && !isProcessing;
  const toggleSelected = () => {
    if (projectId !== null) {
      onToggleSessionSelected?.(projectId, session.id);
    }
  };

  const openActions = useCallback((source: 'touch' | 'pointer') => {
    if (source === 'touch') {
      setIsSheetOpen(true);
      return;
    }
    // A right-click opens the same menu the "…" button does, anchored to it.
    optionsRef.current?.querySelector<HTMLButtonElement>('button')?.click();
  }, []);
  const { handlers: pressHandlers, consumeClickAfterLongPress } = useLongPress(openActions, !isSelecting && !isEditing);

  // While renaming, a click outside the editor cancels, as Escape does.
  useEffect(() => {
    if (!isEditing) {
      return;
    }
    const handlePointerDown = (event: globalThis.MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(event.target as Node)) {
        onCancelEditingSession();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isEditing, onCancelEditingSession]);

  const saveRename = () => {
    if (projectId === null) {
      onCancelEditingSession();
      return;
    }
    onSaveEditingSession(projectId, session.id, renameDraft, session.__provider);
  };

  // Left-click keeps in-app navigation. Ctrl/Cmd-click opens the session in
  // split view where that is available; otherwise, like Shift and middle-click
  // and the native menu, it uses the href to open a new tab/window. While
  // selecting, every click ticks the row.
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (consumeClickAfterLongPress(event)) {
      return;
    }
    if (isSelecting) {
      event.preventDefault();
      if (isSelectable) {
        toggleSelected();
      }
      return;
    }
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && onOpenInSplitView) {
      event.preventDefault();
      onOpenInSplitView(session);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onSessionSelect(session, projectId ?? '');
  };

  // Space activates no anchor and Enter only an anchor, so both keys are
  // handled here and tick the row alike.
  const handleSelectionKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!isSelectable || (event.key !== ' ' && event.key !== 'Enter')) {
      return;
    }
    event.preventDefault();
    toggleSelected();
  };

  const SelectionIcon = isChecked ? CheckSquare : Square;
  const hasChildrenToggle = childCount > 0 && Boolean(onToggleChildren) && !isSelecting;
  const childrenToggleLabel = areChildrenExpanded
    ? t('sessions.collapseChildSessions', { count: childCount, defaultValue: 'Hide {{count}} sessions started from here' })
    : t('sessions.expandChildSessions', { count: childCount, defaultValue: 'Show {{count}} sessions started from here' });
  const canArchive = Boolean(onArchiveSession) && !isProcessing;
  const archiveLabel = t('sessionMenu.archive', { defaultValue: 'Archive' });

  if (isEditing) {
    return (
      <div ref={editorRef} className="flex min-h-10 items-center gap-1.5 rounded-lg bg-accent/60 px-2">
        <input
          type="text"
          value={renameDraft}
          onChange={(event) => onRenameDraftChange(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
              saveRename();
            } else if (event.key === 'Escape') {
              onCancelEditingSession();
            }
          }}
          aria-label={t('sessionMenu.rename', { defaultValue: 'Rename' })}
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          autoFocus
          autoComplete="off"
          // 16px on touch keeps iOS Safari from zooming the viewport on focus.
          style={{ fontSize: 'max(16px, 0.875rem)' }}
        />
        <button
          type="button"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={saveRename}
          title={t('tooltips.save')}
          aria-label={t('tooltips.save')}
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onCancelEditingSession}
          title={t('tooltips.cancel')}
          aria-label={t('tooltips.cancel')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="group/row relative" {...pressHandlers}>
      <a
        href={`/session/${session.id}`}
        role={isSelecting ? 'checkbox' : undefined}
        aria-checked={isSelecting ? isChecked : undefined}
        aria-disabled={isSelecting && !isSelectable ? true : undefined}
        aria-current={isSelected ? 'page' : undefined}
        data-testid="session-row"
        className={cn(
          'flex min-h-10 w-full min-w-0 select-none items-center gap-2.5 rounded-lg px-2 text-left text-sm transition-colors [-webkit-touch-callout:none]',
          isSelected
            ? 'bg-accent text-accent-foreground ring-1 ring-inset ring-border'
            : 'text-foreground hover:bg-accent/50',
          isChecked && 'bg-primary/10',
        )}
        onClick={handleClick}
        onKeyDown={isSelecting ? handleSelectionKeyDown : undefined}
      >
        {isSelecting && (
          <SelectionIcon
            className={cn('h-4 w-4 flex-shrink-0', isChecked ? 'text-primary' : 'text-muted-foreground', !isSelectable && 'opacity-40')}
            aria-hidden="true"
          />
        )}
        <span
          className={cn(
            'flex h-4 w-4 flex-shrink-0 items-center justify-center',
            // The fold toggle sits over this slot: an idle row shows only the
            // toggle, a row with a status shows the status until hovered.
            hasChildrenToggle && (status === 'none'
              ? 'invisible'
              : '[@media(hover:hover)]:group-hover/row:invisible'),
          )}
        >
          <SessionStatusIcon status={status} t={t} />
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate',
            status === 'unread' && 'font-medium',
            status === 'waiting' && 'font-semibold',
            session.isCompleted && !isSelected && 'text-muted-foreground',
          )}
          title={sessionView.sessionName}
        >
          {sessionView.sessionName}
        </span>
        {session.__provider !== 'claude' && (
          <LLMProviderLogo provider={session.__provider} className="h-3 w-3 flex-shrink-0 opacity-70" />
        )}
        {age && (
          <time
            className={cn(
              'flex-shrink-0 text-[11px] tabular-nums text-muted-foreground',
              // The actions take this spot on hover; touch never hovers.
              !isSelecting && '[@media(hover:hover)]:group-focus-within/row:invisible [@media(hover:hover)]:group-hover/row:invisible',
            )}
            dateTime={sessionView.sessionTime}
          >
            {age}
          </time>
        )}
      </a>

      {hasChildrenToggle && (
        // A sibling of the link, laid over its status slot, so toggling never
        // opens the session.
        <button
          type="button"
          className={cn(
            'absolute left-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground',
            status !== 'none' && 'opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 focus-visible:opacity-100',
          )}
          onClick={() => onToggleChildren?.(session.id)}
          aria-expanded={areChildrenExpanded}
          aria-label={childrenToggleLabel}
          title={childrenToggleLabel}
          data-testid="session-children-toggle"
        >
          <ChevronRight className={cn('h-3 w-3 transition-transform', areChildrenExpanded && 'rotate-90')} />
        </button>
      )}

      {!isSelecting && (
        <div
          ref={optionsRef}
          className={cn(
            // Hidden and click-through until hovered, so a tap near the row's
            // right edge on touch opens the session rather than an unseen button.
            'pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md opacity-0',
            '[@media(hover:hover)]:group-focus-within/row:pointer-events-auto [@media(hover:hover)]:group-focus-within/row:opacity-100',
            '[@media(hover:hover)]:group-hover/row:pointer-events-auto [@media(hover:hover)]:group-hover/row:opacity-100',
            'has-[[aria-expanded=true]]:pointer-events-auto has-[[aria-expanded=true]]:opacity-100',
            isSelected ? 'bg-accent' : 'bg-background/90',
          )}
        >
          {canArchive && (
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onArchiveSession?.(session.id)}
              title={archiveLabel}
              aria-label={`${archiveLabel}: ${sessionView.sessionName}`}
              tabIndex={-1}
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
          )}
          <SessionOptions
            sessionId={session.id}
            sessionName={sessionView.sessionName}
            provider={session.__provider}
            projectId={projectId}
            projectLabel={projectLabel}
            isProcessing={isProcessing}
            onStartEditingSession={onStartEditingSession}
            onDeleteSession={onDeleteSession}
            onArchiveSession={onArchiveSession}
            onFork={onForkSession ? () => onForkSession(session) : undefined}
            status={session}
            onSetSessionStatus={onSetSessionStatus}
            onOpenInSplitView={onOpenInSplitView ? () => onOpenInSplitView(session) : undefined}
            t={t}
          />
        </div>
      )}

      {isSheetOpen && (
        <SessionActionsSheet
          open
          onOpenChange={setIsSheetOpen}
          sessionId={session.id}
          sessionName={sessionView.sessionName}
          provider={session.__provider}
          projectId={projectId}
          projectLabel={projectLabel}
          isProcessing={isProcessing}
          onStartEditingSession={onStartEditingSession}
          onDeleteSession={onDeleteSession}
          onArchiveSession={onArchiveSession}
          onFork={onForkSession ? () => onForkSession(session) : undefined}
          status={session}
          onSetSessionStatus={onSetSessionStatus}
          onOpenInSplitView={onOpenInSplitView ? () => onOpenInSplitView(session) : undefined}
          t={t}
        />
      )}
    </div>
  );
}

/**
 * Memoized: a websocket session delta re-renders the sidebar roughly every
 * 0.5-2s during a run, and a rename keystroke re-renders it per character.
 *
 * The lists hand every row but the one being renamed a constant draft, and the
 * session objects come from a per-project cache, so the compare succeeds for
 * the rest. See sidebarRowProps.test.tsx.
 */
export default memo(SidebarSessionItem);
