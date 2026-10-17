import { useState } from 'react';
import { CheckCircle2, CheckSquare, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { TFunction } from 'i18next';

import { Button } from '@/shared/ui';
import { cn } from '@/shared/utils';
import type { LLMProvider, Project, ProjectSession, SessionStatusPatch, SessionWithProvider, SidebarSessionSelection } from '@/shared/types';
import SidebarSessionItem from '@/modules/sidebar/SidebarSessionItem';
import { useCompactSidebar } from '@/modules/sidebar/hooks/useCompactSidebar';

type SidebarProjectSessionsProps = {
  project: Project;
  isExpanded: boolean;
  sessions: SessionWithProvider[];
  selectedSession: ProjectSession | null;
  initialSessionsLoaded: boolean;
  hasMoreSessions: boolean;
  isLoadingMoreSessions: boolean;
  activeSessions: ReadonlySet<string>;
  backgroundSessionIds: ReadonlySet<string>;
  attentionSessionIds: ReadonlySet<string>;
  currentTime: Date;
  /** The session being renamed, when it belongs to this project. */
  sessionRenameId: string | null;
  sessionRenameDraft: string;
  onRenameDraftChange: (draft: string) => void;
  onStartEditingSession: (projectId: string, sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectName: string, sessionId: string, summary: string, provider: LLMProvider) => void;
  onProjectSelect: (project: Project) => void;
  onSessionSelect: (session: SessionWithProvider, projectName: string) => void;
  onDeleteSession: (sessionId: string, sessionTitle: string) => void;
  onForkSession?: (session: SessionWithProvider) => void;
  onSetSessionStatus: (sessionId: string, patch: SessionStatusPatch) => void;
  onOpenInSplitView?: (session: SessionWithProvider) => void;
  onLoadMoreSessions: (projectId: string) => void;
  onNewSession: (project: Project) => void;
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
        <div key={index} className="rounded-md p-2">
          <div className="flex items-start gap-2">
            <div className="mt-0.5 h-3 w-3 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-1">
              <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${60 + index * 15}%` }} />
              <div className="h-2 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

/** Rendered by SidebarProjectItem to show an expanded project's sessions, delegating each row to SidebarSessionItem. */
export default function SidebarProjectSessions({
  project,
  isExpanded,
  sessions,
  selectedSession,
  initialSessionsLoaded,
  hasMoreSessions,
  isLoadingMoreSessions,
  activeSessions,
  backgroundSessionIds,
  attentionSessionIds,
  currentTime,
  sessionRenameId,
  sessionRenameDraft,
  onRenameDraftChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  onProjectSelect,
  onSessionSelect,
  onDeleteSession,
  onForkSession,
  onSetSessionStatus,
  onOpenInSplitView,
  onLoadMoreSessions,
  onNewSession,
  selectedSessionIds,
  onSetSessionSelection,
  onToggleSessionSelected,
  onCancelSessionSelection,
  onDeleteSelectedSessions,
  t,
}: SidebarProjectSessionsProps) {
  const isCompact = useCompactSidebar();
  const [showCompleted, setShowCompleted] = useState(false);

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

  return (
    <div className="ml-3 space-y-1 border-l border-border pl-3">
      {isCompact ? (
        <div className="px-3 pb-1 pt-1">
          <button
            className="flex h-8 w-full items-center justify-center gap-2 rounded-md bg-primary text-xs font-medium text-primary-foreground transition-all duration-150 hover:bg-primary/90 active:scale-[0.98]"
            onClick={() => {
              onProjectSelect(project);
              onNewSession(project);
            }}
          >
            <Plus className="h-3 w-3" />
            {t('sessions.newSession')}
          </button>
        </div>
      ) : (
        <Button
          variant="default"
          size="sm"
          className="flex h-8 w-full justify-start gap-2 bg-primary text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          onClick={() => onNewSession(project)}
        >
          <Plus className="h-3 w-3" />
          {t('sessions.newSession')}
        </Button>
      )}

      {(isSelecting || (initialSessionsLoaded && selectableSessionIds.length > 0)) && (
        <div className={cn('space-y-1', isCompact && 'px-3')}>
          {isSelecting ? (
            <>
              {/* Wraps rather than clips: at the narrowest sidebar width a long
                  translated "Select all loaded" leaves no room for Cancel. */}
              <div className="flex flex-wrap items-center justify-between gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
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
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={onCancelSessionSelection}
                >
                  {t('actions.cancel')}
                </Button>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="h-8 w-full justify-center gap-2 bg-red-600 text-xs font-medium text-white hover:bg-red-700"
                onClick={() => onDeleteSelectedSessions(effectiveSelectedIds)}
                disabled={effectiveSelectedIds.length === 0}
              >
                <Trash2 className="h-3 w-3" />
                {t('sessions.deleteSelected', { count: effectiveSelectedIds.length })}
              </Button>
            </>
          ) : (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() =>
                  onSetSessionSelection({ projectId: project.projectId, sessionIds: new Set() })
                }
              >
                <CheckSquare className="h-3 w-3" />
                {t('sessions.select')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* A page emptied by deleting every loaded row still has sessions behind
          it on the server, so it keeps its "Load more" instead of "No sessions". */}
      {!initialSessionsLoaded ? (
        <SessionListSkeleton />
      ) : !hasSessions && !hasMoreSessions ? (
        <div className="px-3 py-2 text-left">
          <p className="text-xs text-muted-foreground">{t('sessions.noSessions')}</p>
        </div>
      ) : (
        <>
          {(() => {
            const { openSessions, completedSessions } = partitionSessionsByStatus(sessions);
            const renderRow = (session: SessionWithProvider) => (
            <SidebarSessionItem
              key={session.id}
              project={project}
              session={session}
              selectedSession={selectedSession}
              isProcessing={isSessionRunning(session)}
              hasBackgroundWork={backgroundSessionIds.has(session.id)}
              needsAttention={attentionSessionIds.has(session.id)}
              currentTime={currentTime}
              onRenameDraftChange={onRenameDraftChange}
              isEditing={session.id === sessionRenameId}
              renameDraft={session.id === sessionRenameId ? sessionRenameDraft : ''}
              onStartEditingSession={onStartEditingSession}
              onCancelEditingSession={onCancelEditingSession}
              onSaveEditingSession={onSaveEditingSession}
              onProjectSelect={onProjectSelect}
              onSessionSelect={onSessionSelect}
              onDeleteSession={onDeleteSession}
              onForkSession={onForkSession}
              onSetSessionStatus={onSetSessionStatus}
              onOpenInSplitView={onOpenInSplitView}
              isSelecting={isSelecting}
              isChecked={checkedSessionIds.has(session.id)}
              onToggleSessionSelected={onToggleSessionSelected}
              t={t}
            />
            );
            // The selected session stays visible even when completed, or the
            // highlighted row would vanish into a folded section.
            const completedExpanded = showCompleted
              || completedSessions.some((session) => session.id === selectedSession?.id);
            return (
              <>
                {openSessions.map(renderRow)}
                {completedSessions.length > 0 && (
                  <>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] text-muted-foreground hover:text-foreground',
                        isCompact && 'mx-3 w-auto',
                      )}
                      aria-expanded={completedExpanded}
                      onClick={() => setShowCompleted((previous) => !previous)}
                    >
                      <ChevronRight className={cn('h-3 w-3 transition-transform', completedExpanded && 'rotate-90')} />
                      <CheckCircle2 className="h-3 w-3" />
                      <span className="flex-1">{t('sessions.completedSection', { defaultValue: 'Completed' })}</span>
                      <span className="tabular-nums">{completedSessions.length}</span>
                    </button>
                    {completedExpanded && completedSessions.map(renderRow)}
                  </>
                )}
              </>
            );
          })()}

          {hasMoreSessions && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-center text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onLoadMoreSessions(project.projectId)}
              disabled={isLoadingMoreSessions}
            >
              {isLoadingMoreSessions ? t('sessions.loadingSessions') : 'Load more sessions'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
