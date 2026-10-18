import { memo, useCallback, useEffect, useRef } from 'react';
import { CheckSquare, ChevronRight, Edit3, MoreHorizontal, Plus, Star, StarOff, Trash2 } from 'lucide-react';
import type { TFunction } from 'i18next';

import { ActionMenu } from '@/shared/ui';
import type { ActionMenuItem } from '@/shared/ui';
import { cn } from '@/shared/utils';
import type { LLMProvider, MCPServerStatus, Project, ProjectSession, SessionStatusPatch, SessionWithProvider, SidebarSessionSelection } from '@/shared/types';
import { getTaskIndicatorStatus } from '@/modules/sidebar/utils/sidebarProjectFormatting';
import { useLongPress } from '@/modules/sidebar/hooks/useLongPress';
import TaskIndicator from '@/modules/sidebar/TaskIndicator';
import SidebarProjectSessions from '@/modules/sidebar/SidebarProjectSessions';

type SidebarProjectItemProps = {
  project: Project;
  selectedSession: ProjectSession | null;
  isExpanded: boolean;
  isDeleting: boolean;
  isStarred: boolean;
  /** Resolved for this row: only the project being renamed re-renders on a keystroke. */
  isEditing: boolean;
  renameDraft: string;
  /** The group's rows: loaded sessions passing the status filter, pinned ones excluded. */
  sessions: SessionWithProvider[];
  /** The number beside the name: the server's total without a filter, the matching rows with one. */
  sessionCount: number;
  showCompletedInline: boolean;
  initialSessionsLoaded: boolean;
  isLoadingMoreSessions: boolean;
  currentTime: Date;
  /** The session being renamed, when it belongs to this project. */
  sessionRenameId: string | null;
  sessionRenameDraft: string;
  tasksEnabled: boolean;
  mcpServerStatus: MCPServerStatus;
  onRenameDraftChange: (name: string) => void;
  onToggleProject: (projectId: string) => void;
  onToggleStarProject: (projectId: string) => void;
  onStartEditingProject: (project: Project) => void;
  onCancelEditingProject: () => void;
  onSaveProjectName: (projectId: string, nextName: string) => void;
  onDeleteProject: (project: Project) => void;
  onSessionSelect: (session: SessionWithProvider, projectName: string) => void;
  onDeleteSession: (sessionId: string, sessionTitle: string) => void;
  onArchiveSession: (sessionId: string) => void;
  onForkSession?: (session: SessionWithProvider) => void;
  onSetSessionStatus: (sessionId: string, patch: SessionStatusPatch) => void;
  onOpenInSplitView?: (session: SessionWithProvider) => void;
  onLoadMoreSessions: (projectId: string) => void;
  activeSessions: ReadonlySet<string>;
  backgroundSessionIds: ReadonlySet<string>;
  attentionSessionIds: ReadonlySet<string>;
  waitingSessionIds: ReadonlySet<string>;
  onNewSession: (project: Project) => void;
  onStartEditingSession: (projectId: string, sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectName: string, sessionId: string, summary: string, provider: LLMProvider) => void;
  /** The sessions ticked in this project's list, or null when it is not the one selecting. */
  selectedSessionIds: ReadonlySet<string> | null;
  onSetSessionSelection: (selection: SidebarSessionSelection) => void;
  onToggleSessionSelected: (projectId: string, sessionId: string) => void;
  onCancelSessionSelection: () => void;
  onDeleteSelectedSessions: (sessionIds: string[]) => void;
  t: TFunction;
};

/**
 * Rendered by SidebarProjectList for one project group: a compact header (name,
 * count, "+" for a new session there, "…" for the project's own actions) over
 * its session rows. One rendering for every width.
 */
function SidebarProjectItem({
  project,
  selectedSession,
  isExpanded,
  isDeleting,
  isStarred,
  isEditing,
  renameDraft,
  sessions,
  sessionCount,
  showCompletedInline,
  initialSessionsLoaded,
  isLoadingMoreSessions,
  currentTime,
  sessionRenameId,
  sessionRenameDraft,
  tasksEnabled,
  mcpServerStatus,
  onRenameDraftChange,
  onToggleProject,
  onToggleStarProject,
  onStartEditingProject,
  onCancelEditingProject,
  onSaveProjectName,
  onDeleteProject,
  onSessionSelect,
  onDeleteSession,
  onArchiveSession,
  onForkSession,
  onSetSessionStatus,
  onOpenInSplitView,
  onLoadMoreSessions,
  activeSessions,
  backgroundSessionIds,
  attentionSessionIds,
  waitingSessionIds,
  onNewSession,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  selectedSessionIds,
  onSetSessionSelection,
  onToggleSessionSelected,
  onCancelSessionSelection,
  onDeleteSelectedSessions,
  t,
}: SidebarProjectItemProps) {
  const taskStatus = getTaskIndicatorStatus(project, mcpServerStatus);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // On a phone the keyboard covers the lower half: keep the field in view.
  useEffect(() => {
    if (!isEditing || !renameInputRef.current) {
      return;
    }

    let animationFrame = 0;
    const revealInput = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        renameInputRef.current?.scrollIntoView({ block: 'center', inline: 'nearest' });
      });
    };

    revealInput();
    window.visualViewport?.addEventListener('resize', revealInput);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.visualViewport?.removeEventListener('resize', revealInput);
    };
  }, [isEditing]);

  const openMenu = useCallback(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.click();
  }, []);
  const { handlers: pressHandlers, consumeClickAfterLongPress } = useLongPress(openMenu, !isEditing);

  const saveProjectName = () => {
    onSaveProjectName(project.projectId, renameDraft);
  };

  // A running session cannot be deleted, so a group made only of running rows
  // has nothing to select.
  const hasSelectableSessions = sessions.some(
    (session) => !activeSessions.has(session.id) || backgroundSessionIds.has(session.id),
  );

  const startSelecting = () => {
    if (!isExpanded) {
      onToggleProject(project.projectId);
    }
    onSetSessionSelection({ projectId: project.projectId, sessionIds: new Set() });
  };

  const menuItems: ActionMenuItem[] = [
    {
      key: 'rename',
      label: t('projectMenu.rename', { defaultValue: 'Rename project' }),
      icon: Edit3,
      onSelect: () => onStartEditingProject(project),
    },
    {
      key: 'star',
      label: isStarred ? t('tooltips.removeFromFavorites') : t('tooltips.addToFavorites'),
      icon: isStarred ? StarOff : Star,
      onSelect: () => onToggleStarProject(project.projectId),
    },
    ...(initialSessionsLoaded && hasSelectableSessions && selectedSessionIds === null ? [{
      key: 'select',
      label: t('sessions.select'),
      icon: CheckSquare,
      onSelect: startSelecting,
    }] : []),
    {
      key: 'delete',
      label: t('projectMenu.remove', { defaultValue: 'Remove from sidebar…' }),
      icon: Trash2,
      isDanger: true,
      showDividerBefore: true,
      onSelect: () => onDeleteProject(project),
    },
  ];
  const newSessionLabel = t('sessions.newSessionIn', { project: project.displayName, defaultValue: 'New session in {{project}}' });

  return (
    <section
      className={cn('pt-1', isDeleting && 'pointer-events-none opacity-50')}
      aria-label={project.displayName}
    >
      {isEditing ? (
        <div className="flex min-h-9 items-center gap-1.5 px-1">
          <input
            ref={renameInputRef}
            type="text"
            value={renameDraft}
            onChange={(event) => onRenameDraftChange(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={t('projects.projectNamePlaceholder')}
            aria-label={t('projectMenu.rename', { defaultValue: 'Rename project' })}
            autoFocus
            autoComplete="off"
            style={{ fontSize: 'max(16px, 0.875rem)' }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                saveProjectName();
              }
              if (event.key === 'Escape') {
                // Cancelling the rename must not also close the code editor.
                event.stopPropagation();
                onCancelEditingProject();
              }
            }}
          />
          <button
            type="button"
            className="h-8 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={saveProjectName}
          >
            {t('actions.save')}
          </button>
          <button
            type="button"
            className="h-8 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onCancelEditingProject}
          >
            {t('actions.cancel')}
          </button>
        </div>
      ) : (
        <div
          className="group/project sticky top-0 z-10 flex min-h-9 select-none items-center gap-0.5 bg-background pl-1 pr-0.5 [-webkit-touch-callout:none]"
          {...pressHandlers}
        >
          <button
            type="button"
            className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 text-left text-muted-foreground hover:text-foreground"
            aria-expanded={isExpanded}
            onClick={(event) => {
              if (!consumeClickAfterLongPress(event)) {
                onToggleProject(project.projectId);
              }
            }}
            title={project.fullPath}
          >
            <ChevronRight className={cn('h-3 w-3 flex-shrink-0 transition-transform', isExpanded && 'rotate-90')} />
            <span className="truncate text-[11px] font-medium uppercase tracking-wider">{project.displayName}</span>
            {isStarred && (
              <Star
                className="h-3 w-3 flex-shrink-0 fill-current text-yellow-500"
                aria-label={t('projectMenu.starred', { defaultValue: 'Favorite' })}
              />
            )}
            {tasksEnabled && <TaskIndicator status={taskStatus} size="xs" className="flex-shrink-0" />}
            <span className="ml-auto pl-1 text-[11px] tabular-nums">{sessionCount}</span>
          </button>
          <div
            ref={menuRef}
            className={cn(
              'flex items-center',
              // Hidden until hovered on a mouse; a long press on the header opens it on touch.
              'pointer-events-none opacity-0 [@media(hover:hover)]:group-hover/project:pointer-events-auto [@media(hover:hover)]:group-hover/project:opacity-100',
              'focus-within:pointer-events-auto focus-within:opacity-100 has-[[aria-expanded=true]]:pointer-events-auto has-[[aria-expanded=true]]:opacity-100',
            )}
          >
            <ActionMenu
              label={t('projectMenu.options', { defaultValue: 'Project options' })}
              ariaLabel={`${t('projectMenu.options', { defaultValue: 'Project options' })}: ${project.displayName}`}
              icon={MoreHorizontal}
              iconOnly
              portal
              variant="ghost"
              size="icon"
              triggerClassName="h-7 w-7 text-muted-foreground hover:bg-muted hover:text-foreground"
              menuClassName="w-[240px] rounded-xl p-1.5 shadow-xl"
              items={menuItems}
            />
          </div>
          <button
            type="button"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => onNewSession(project)}
            title={newSessionLabel}
            aria-label={newSessionLabel}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <SidebarProjectSessions
        project={project}
        isExpanded={isExpanded}
        sessions={sessions}
        showCompletedInline={showCompletedInline}
        selectedSession={selectedSession}
        initialSessionsLoaded={initialSessionsLoaded}
        hasMoreSessions={Boolean(project.sessionMeta?.hasMore)}
        isLoadingMoreSessions={isLoadingMoreSessions}
        activeSessions={activeSessions}
        backgroundSessionIds={backgroundSessionIds}
        attentionSessionIds={attentionSessionIds}
        waitingSessionIds={waitingSessionIds}
        currentTime={currentTime}
        sessionRenameId={sessionRenameId}
        sessionRenameDraft={sessionRenameDraft}
        onRenameDraftChange={onRenameDraftChange}
        onStartEditingSession={onStartEditingSession}
        onCancelEditingSession={onCancelEditingSession}
        onSaveEditingSession={onSaveEditingSession}
        onSessionSelect={onSessionSelect}
        onDeleteSession={onDeleteSession}
        onArchiveSession={onArchiveSession}
        onForkSession={onForkSession}
        onSetSessionStatus={onSetSessionStatus}
        onOpenInSplitView={onOpenInSplitView}
        onLoadMoreSessions={onLoadMoreSessions}
        selectedSessionIds={selectedSessionIds}
        onSetSessionSelection={onSetSessionSelection}
        onToggleSessionSelected={onToggleSessionSelected}
        onCancelSessionSelection={onCancelSessionSelection}
        onDeleteSelectedSessions={onDeleteSelectedSessions}
        t={t}
      />
    </section>
  );
}

/**
 * Memoized: a websocket session delta re-renders the sidebar roughly every
 * 0.5-2s during a run, and a rename keystroke re-renders it per character.
 *
 * Both renames are resolved to scalars by SidebarProjectList and the filtered
 * session array is cached per project, so a keystroke changes props on exactly
 * one group and every other group's compare succeeds. See sidebarRowProps.test.tsx.
 */
export default memo(SidebarProjectItem);
