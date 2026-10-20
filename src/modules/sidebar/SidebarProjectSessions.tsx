import { Fragment, useCallback, useMemo, useState } from 'react';
import { ChevronRight, Trash2 } from 'lucide-react';
import type { TFunction } from 'i18next';

import { Button } from '@/shared/ui';
import { cn } from '@/shared/utils';
import type { LLMProvider, Project, ProjectSession, SessionStatusPatch, SessionWithProvider, SidebarSessionSelection } from '@/shared/types';
import SidebarSessionItem from '@/modules/sidebar/SidebarSessionItem';
import {
  getAncestorIds,
  nestChildSessions,
  readCollapsedSessionParents,
  toggleCollapsedSessionParent,
} from '@/modules/sidebar/utils/sessionNesting';

// Open rows a group shows before "Show more": enough to reach the recent work,
// few enough that several projects fit on one screen.
const VISIBLE_OPEN_SESSIONS = 6;

type SidebarProjectSessionsProps = {
  project: Project;
  isExpanded: boolean;
  /** The project's loaded sessions that pass the status filter, pinned ones excluded (they sit in the pinned section). */
  sessions: SessionWithProvider[];
  /** With the "completed" filter the completed rows are the list, not a folded extra. */
  showCompletedInline: boolean;
  selectedSession: ProjectSession | null;
  initialSessionsLoaded: boolean;
  hasMoreSessions: boolean;
  isLoadingMoreSessions: boolean;
  activeSessions: ReadonlySet<string>;
  backgroundSessionIds: ReadonlySet<string>;
  attentionSessionIds: ReadonlySet<string>;
  waitingSessionIds: ReadonlySet<string>;
  currentTime: Date;
  /** The session being renamed, when it belongs to this project. */
  sessionRenameId: string | null;
  sessionRenameDraft: string;
  onRenameDraftChange: (draft: string) => void;
  onStartEditingSession: (projectId: string, sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectName: string, sessionId: string, summary: string, provider: LLMProvider) => void;
  onSessionSelect: (session: SessionWithProvider, projectName: string) => void;
  onDeleteSession: (sessionId: string, sessionTitle: string) => void;
  onArchiveSession: (sessionId: string) => void;
  onForkSession?: (session: SessionWithProvider) => void;
  onSetSessionStatus: (sessionId: string, patch: SessionStatusPatch) => void;
  onOpenInSplitView?: (session: SessionWithProvider) => void;
  onLoadMoreSessions: (projectId: string) => void;
  /** The sessions ticked here, or null when this project's list is not in selection mode. */
  selectedSessionIds: ReadonlySet<string> | null;
  onSetSessionSelection: (selection: SidebarSessionSelection) => void;
  onToggleSessionSelected: (projectId: string, sessionId: string) => void;
  onCancelSessionSelection: () => void;
  onDeleteSelectedSessions: (sessionIds: string[]) => void;
  t: TFunction;
};

/**
 * Orders a project's loaded rows for display: open sessions with the pinned
 * ones first, then the completed ones, which the list folds away. The sort is
 * stable, so within each group the server's recency order is kept.
 */
export function partitionSessionsByStatus(sessions: SessionWithProvider[]): {
  openSessions: SessionWithProvider[];
  completedSessions: SessionWithProvider[];
} {
  const openSessions = sessions.filter((session) => !session.isCompleted);
  return {
    openSessions: [
      ...openSessions.filter((session) => session.isPinned),
      ...openSessions.filter((session) => !session.isPinned),
    ],
    completedSessions: sessions.filter((session) => session.isCompleted),
  };
}

function SessionListSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="flex min-h-10 items-center gap-2.5 px-2">
          <div className="h-3 w-3 animate-pulse rounded-full bg-muted" />
          <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${55 + index * 12}%` }} />
        </div>
      ))}
    </>
  );
}

/** Rendered by SidebarProjectItem for the rows of an open project group: open sessions, the folded "Completed" section, "Load more" and bulk selection. */
export default function SidebarProjectSessions({
  project,
  isExpanded,
  sessions,
  showCompletedInline,
  selectedSession,
  initialSessionsLoaded,
  hasMoreSessions,
  isLoadingMoreSessions,
  activeSessions,
  backgroundSessionIds,
  attentionSessionIds,
  waitingSessionIds,
  currentTime,
  sessionRenameId,
  sessionRenameDraft,
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
  onLoadMoreSessions,
  selectedSessionIds,
  onSetSessionSelection,
  onToggleSessionSelected,
  onCancelSessionSelection,
  onDeleteSelectedSessions,
  t,
}: SidebarProjectSessionsProps) {
  // The folded "Completed" rows of this group, opened on demand.
  const [showCompleted, setShowCompleted] = useState(false);
  // Past the first few open rows the group stays short until asked.
  const [showAllOpen, setShowAllOpen] = useState(false);
  // Parents whose spawned sessions are folded away (shared by every group, kept in localStorage).
  const [collapsedParentIds, setCollapsedParentIds] = useState(readCollapsedSessionParents);
  const toggleChildren = useCallback((parentId: string) => {
    setCollapsedParentIds(toggleCollapsedSessionParent(parentId));
  }, []);
  const nested = useMemo(() => nestChildSessions(sessions), [sessions]);

  if (!isExpanded) {
    return null;
  }

  const hasSessions = sessions.length > 0;
  const isSelecting = selectedSessionIds !== null;
  // A session with a response in flight cannot be deleted — the same rule the
  // row's options menu applies — so it is not selectable either.
  const isSessionRunning = (session: SessionWithProvider) =>
    activeSessions.has(session.id) && !backgroundSessionIds.has(session.id);
  const selectableSessionIds = sessions.filter((session) => !isSessionRunning(session)).map((session) => session.id);
  // Re-derived from the selectable rows rather than read straight off the
  // selection, so a row that started running after it was ticked drops out of
  // the count, the button and the ids the confirmation is opened with.
  const effectiveSelectedIds = selectedSessionIds
    ? selectableSessionIds.filter((sessionId) => selectedSessionIds.has(sessionId))
    : [];
  const checkedSessionIds = new Set(effectiveSelectedIds);
  const allLoadedSelected =
    selectableSessionIds.length > 0 && effectiveSelectedIds.length === selectableSessionIds.length;
  // With more sessions on the server than on screen, the button only reaches the
  // loaded rows, so it offers "Select all loaded" rather than a "Select all" it
  // could not honour. Once those rows are ticked it flips to "Clear" either way.
  const selectAllLabel = allLoadedSelected
    ? t('sessions.clearSelection')
    : hasMoreSessions
      ? t('sessions.selectAllLoaded')
      : t('sessions.selectAll');

  // The selected session's parents always show their children, or the
  // highlighted row would be folded out of sight.
  const forcedOpenParentIds = new Set(selectedSession ? getAncestorIds(selectedSession.id, nested) : []);
  const areChildrenShown = (parentId: string) =>
    isSelecting || forcedOpenParentIds.has(parentId) || !collapsedParentIds.has(parentId);

  const renderRow = (session: SessionWithProvider) => (
    <SidebarSessionItem
      key={session.id}
      projectId={project.projectId}
      session={session}
      selectedSession={selectedSession}
      isProcessing={isSessionRunning(session)}
      hasBackgroundWork={backgroundSessionIds.has(session.id)}
      needsAttention={attentionSessionIds.has(session.id)}
      isWaiting={waitingSessionIds.has(session.id)}
      currentTime={currentTime}
      onRenameDraftChange={onRenameDraftChange}
      isEditing={session.id === sessionRenameId}
      renameDraft={session.id === sessionRenameId ? sessionRenameDraft : ''}
      onStartEditingSession={onStartEditingSession}
      onCancelEditingSession={onCancelEditingSession}
      onSaveEditingSession={onSaveEditingSession}
      onSessionSelect={onSessionSelect}
      onDeleteSession={onDeleteSession}
      onArchiveSession={onArchiveSession}
      onForkSession={onForkSession}
      onSetSessionStatus={onSetSessionStatus}
      onOpenInSplitView={onOpenInSplitView}
      isSelecting={isSelecting}
      isChecked={checkedSessionIds.has(session.id)}
      onToggleSessionSelected={onToggleSessionSelected}
      childCount={nested.childrenByParentId.get(session.id)?.length ?? 0}
      areChildrenExpanded={areChildrenShown(session.id)}
      onToggleChildren={toggleChildren}
      t={t}
    />
  );

  // A row, then the sessions spawned from it, indented on a thin tree line.
  const renderTree = (session: SessionWithProvider) => {
    const children = nested.childrenByParentId.get(session.id) ?? [];
    return (
      <Fragment key={session.id}>
        {renderRow(session)}
        {children.length > 0 && areChildrenShown(session.id) && (
          <div className="ml-4 space-y-px border-l border-border pl-1" data-testid="session-children">
            {children.map(renderTree)}
          </div>
        )}
      </Fragment>
    );
  };

  // Children follow their parent wherever it sits, so only the roots are
  // partitioned and counted against the fold.
  const { openSessions, completedSessions } = showCompletedInline
    ? { openSessions: nested.roots, completedSessions: [] }
    : partitionSessionsByStatus(nested.roots);
  // The selected session stays visible even past the fold or when completed,
  // or the highlighted row would vanish.
  const selectedRootId = selectedSession ? nested.rootIdBySessionId.get(selectedSession.id) : undefined;
  const selectedOpenIndex = openSessions.findIndex((session) => session.id === selectedRootId);
  const openExpanded = showAllOpen || isSelecting || selectedOpenIndex >= VISIBLE_OPEN_SESSIONS;
  const visibleOpenSessions = openExpanded ? openSessions : openSessions.slice(0, VISIBLE_OPEN_SESSIONS);
  const hiddenOpenCount = openSessions.length - visibleOpenSessions.length;
  const completedExpanded = showCompleted
    || isSelecting
    || completedSessions.some((session) => session.id === selectedRootId);

  return (
    <div className="space-y-px pb-1">
      {isSelecting && (
        // Wraps rather than clips: at the narrowest sidebar width a long
        // translated "Select all loaded" leaves no room for Cancel.
        <div className="space-y-1 px-1 pb-1">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() =>
                onSetSessionSelection({
                  projectId: project.projectId,
                  sessionIds: new Set(allLoadedSelected ? [] : selectableSessionIds),
                })
              }
              disabled={selectableSessionIds.length === 0}
            >
              {selectAllLabel}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={onCancelSessionSelection}
            >
              {t('actions.cancel')}
            </Button>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="h-9 w-full justify-center gap-2 text-xs font-medium"
            onClick={() => onDeleteSelectedSessions(effectiveSelectedIds)}
            disabled={effectiveSelectedIds.length === 0}
          >
            <Trash2 className="h-3 w-3" />
            {t('sessions.deleteSelected', { count: effectiveSelectedIds.length })}
          </Button>
        </div>
      )}

      {/* A page emptied by deleting every loaded row still has sessions behind
          it on the server, so it keeps its "Load more" instead of "No sessions". */}
      {!initialSessionsLoaded ? (
        <SessionListSkeleton />
      ) : !hasSessions && !hasMoreSessions ? (
        <p className="px-2 py-2 text-xs text-muted-foreground">{t('sessions.noSessions')}</p>
      ) : (
        <>
          {visibleOpenSessions.map(renderTree)}
          {hiddenOpenCount > 0 && (
            <button
              type="button"
              className="flex min-h-9 w-full items-center px-2 pl-[34px] text-left text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowAllOpen(true)}
            >
              {t('sessions.showMoreCount', { count: hiddenOpenCount, defaultValue: 'Show {{count}} more' })}
            </button>
          )}
          {completedSessions.length > 0 && (
            <>
              <button
                type="button"
                className="flex min-h-9 w-full items-center gap-1.5 rounded-md px-2 text-left text-xs text-muted-foreground hover:text-foreground"
                aria-expanded={completedExpanded}
                onClick={() => setShowCompleted((previous) => !previous)}
              >
                <ChevronRight className={cn('h-3 w-3 transition-transform', completedExpanded && 'rotate-90')} />
                <span className="flex-1">{t('sessions.completedSection', { defaultValue: 'Completed' })}</span>
                <span className="tabular-nums">{completedSessions.length}</span>
              </button>
              {completedExpanded && completedSessions.map(renderTree)}
            </>
          )}

          {hasMoreSessions && (openExpanded || hiddenOpenCount === 0) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-full justify-start pl-[34px] text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onLoadMoreSessions(project.projectId)}
              disabled={isLoadingMoreSessions}
            >
              {isLoadingMoreSessions
                ? t('sessions.loadingSessions')
                : t('sessions.loadMore', { defaultValue: 'Load more sessions' })}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
