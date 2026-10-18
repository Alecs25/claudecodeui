import { useEffect } from 'react';
import { Pin } from 'lucide-react';

import type { SessionStatusFilter, SessionWithProvider, SidebarProjectListProps } from '@/shared/types';
import { getPageTitle } from '@/shared/utils';
import SidebarProjectItem from '@/modules/sidebar/SidebarProjectItem';
import SidebarProjectsState from '@/modules/sidebar/SidebarProjectsState';
import SidebarSessionItem from '@/modules/sidebar/SidebarSessionItem';

type SplitSessions = { pinned: SessionWithProvider[]; rest: SessionWithProvider[] };

// Without a set-based filter the split depends only on the project's session
// array, which getAllSessions caches per project: caching the split against it
// keeps every group's `sessions` prop the same array between renders, so the
// memoized groups and rows bail out on unrelated updates.
const flagSplitCache = new WeakMap<SessionWithProvider[], Map<SessionStatusFilter, SplitSessions>>();

type StatusSets = Pick<SidebarProjectListProps, 'activeSessions' | 'waitingSessionIds' | 'attentionSessionIds'>;

const matchesStatus = (session: SessionWithProvider, filter: SessionStatusFilter, sets: StatusSets): boolean => {
  switch (filter) {
    case 'running':
      return sets.activeSessions.has(session.id);
    case 'waiting':
      return sets.waitingSessionIds.has(session.id);
    case 'unread':
      return Boolean(session.isUnread) || sets.attentionSessionIds.has(session.id);
    case 'pinned':
      return Boolean(session.isPinned);
    case 'completed':
      return Boolean(session.isCompleted);
    default:
      return true;
  }
};

const splitSessions = (sessions: SessionWithProvider[], filter: SessionStatusFilter, sets: StatusSets): SplitSessions => {
  const split = (): SplitSessions => {
    const matching = sessions.filter((session) => matchesStatus(session, filter, sets));
    return {
      pinned: matching.filter((session) => session.isPinned),
      rest: matching.filter((session) => !session.isPinned),
    };
  };

  const dependsOnSets = filter === 'running' || filter === 'waiting' || filter === 'unread';
  if (dependsOnSets) {
    return split();
  }
  let byFilter = flagSplitCache.get(sessions);
  if (!byFilter) {
    byFilter = new Map();
    flagSplitCache.set(sessions, byFilter);
  }
  const cached = byFilter.get(filter);
  if (cached) {
    return cached;
  }
  const result = split();
  byFilter.set(filter, result);
  return result;
};

const sessionTime = (session: SessionWithProvider): number =>
  new Date(String(session.lastActivity || session.createdAt || session.created_at || 0)).getTime() || 0;

/**
 * Rendered by SidebarContent for the grouped view: the pinned sessions of every
 * shown project on top, then one group per project with the rest.
 */
export default function SidebarProjectList({
  projects,
  filteredProjects,
  statusFilter,
  selectedProject,
  selectedSession,
  isLoading,
  loadingProgress,
  isProjectExpanded,
  activeRename,
  initialSessionsLoaded,
  currentTime,
  deletingProjects,
  tasksEnabled,
  mcpServerStatus,
  getProjectSessions,
  onLoadMoreSessions,
  loadingMoreProjects,
  activeSessions,
  backgroundSessionIds,
  attentionSessionIds,
  waitingSessionIds,
  isProjectStarred,
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
  onNewSession,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  sessionSelection,
  onSetSessionSelection,
  onToggleSessionSelected,
  onCancelSessionSelection,
  onDeleteSelectedSessions,
  t,
}: SidebarProjectListProps) {
  const pageTitle = getPageTitle(selectedProject, selectedSession);

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  const showProjects = !isLoading && projects.length > 0 && filteredProjects.length > 0;
  if (!showProjects) {
    return (
      <SidebarProjectsState
        isLoading={isLoading}
        loadingProgress={loadingProgress}
        projectsCount={projects.length}
        filteredProjectsCount={filteredProjects.length}
        t={t}
      />
    );
  }

  const sets: StatusSets = { activeSessions, waitingSessionIds, attentionSessionIds };
  const groups = filteredProjects.map((project) => ({
    project,
    ...splitSessions(getProjectSessions(project), statusFilter, sets),
  }));
  const pinnedRows = groups
    .flatMap(({ project, pinned }) => pinned.map((session) => ({ project, session })))
    .sort((a, b) => sessionTime(b.session) - sessionTime(a.session));
  // Without a filter every project keeps its group, empty or not, so its "+"
  // stays reachable; with one, a group with nothing matching is noise.
  const visibleGroups = statusFilter === 'all' ? groups : groups.filter((group) => group.rest.length > 0);
  const renamingSessionId = activeRename?.target === 'session' ? activeRename.id : null;

  if (pinnedRows.length === 0 && visibleGroups.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-xs text-muted-foreground">
        {t('recent.noMatchingStatus', { defaultValue: 'No conversations' })}
      </p>
    );
  }

  return (
    <div className="pb-safe-area-inset-bottom">
      {pinnedRows.length > 0 && (
        <section aria-label={t('sessionStatus.pinnedSection', { defaultValue: 'Pinned' })} className="pb-1">
          <h3 className="flex min-h-8 items-center gap-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Pin className="h-3 w-3" />
            {t('sessionStatus.pinnedSection', { defaultValue: 'Pinned' })}
          </h3>
          <div className="space-y-px">
            {pinnedRows.map(({ project, session }) => {
              const isEditing = session.id === renamingSessionId;
              return (
                <SidebarSessionItem
                  key={session.id}
                  projectId={project.projectId}
                  projectLabel={project.displayName}
                  session={session}
                  selectedSession={selectedSession}
                  isProcessing={activeSessions.has(session.id) && !backgroundSessionIds.has(session.id)}
                  hasBackgroundWork={backgroundSessionIds.has(session.id)}
                  needsAttention={attentionSessionIds.has(session.id)}
                  isWaiting={waitingSessionIds.has(session.id)}
                  currentTime={currentTime}
                  isEditing={isEditing}
                  renameDraft={isEditing ? activeRename?.draft ?? '' : ''}
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
                  t={t}
                />
              );
            })}
          </div>
        </section>
      )}

      {visibleGroups.map(({ project, rest }) => {
        // Both renames are resolved here rather than inside the group, so
        // every other group is handed the same scalars on each keystroke and
        // its memo boundary holds.
        const renamingProject =
          activeRename?.target === 'project' && activeRename.id === project.projectId
            ? activeRename
            : null;
        const renamingSession =
          activeRename?.target === 'session' && activeRename.projectId === project.projectId
            ? activeRename
            : null;
        // Resolved here for the same reason as the renames: only the
        // project in selection mode sees a set, every other group keeps
        // being handed the same `null` and its memo holds.
        const selectedSessionIds =
          sessionSelection?.projectId === project.projectId ? sessionSelection.sessionIds : null;
        const sessionCount = statusFilter === 'all'
          ? Number(project.sessionMeta?.total ?? rest.length)
          : rest.length;

        // React key + per-project state lookups all use the DB `projectId`
        // so they remain stable across renames and session changes.
        return (
          <SidebarProjectItem
            key={project.projectId}
            project={project}
            selectedSession={selectedSession}
            isExpanded={isProjectExpanded(project.projectId)}
            isDeleting={deletingProjects.has(project.projectId)}
            isStarred={isProjectStarred(project.projectId)}
            isEditing={renamingProject !== null}
            renameDraft={renamingProject?.draft ?? ''}
            sessions={rest}
            sessionCount={sessionCount}
            showCompletedInline={statusFilter === 'completed'}
            initialSessionsLoaded={initialSessionsLoaded.has(project.projectId)}
            isLoadingMoreSessions={loadingMoreProjects.has(project.projectId)}
            currentTime={currentTime}
            sessionRenameId={renamingSession?.id ?? null}
            sessionRenameDraft={renamingSession?.draft ?? ''}
            tasksEnabled={tasksEnabled}
            mcpServerStatus={mcpServerStatus}
            onRenameDraftChange={onRenameDraftChange}
            onToggleProject={onToggleProject}
            onToggleStarProject={onToggleStarProject}
            onStartEditingProject={onStartEditingProject}
            onCancelEditingProject={onCancelEditingProject}
            onSaveProjectName={onSaveProjectName}
            onDeleteProject={onDeleteProject}
            onSessionSelect={onSessionSelect}
            onDeleteSession={onDeleteSession}
            onArchiveSession={onArchiveSession}
            onForkSession={onForkSession}
            onSetSessionStatus={onSetSessionStatus}
            onOpenInSplitView={onOpenInSplitView}
            onLoadMoreSessions={onLoadMoreSessions}
            activeSessions={activeSessions}
            backgroundSessionIds={backgroundSessionIds}
            attentionSessionIds={attentionSessionIds}
            waitingSessionIds={waitingSessionIds}
            onNewSession={onNewSession}
            onStartEditingSession={onStartEditingSession}
            onCancelEditingSession={onCancelEditingSession}
            onSaveEditingSession={onSaveEditingSession}
            selectedSessionIds={selectedSessionIds}
            onSetSessionSelection={onSetSessionSelection}
            onToggleSessionSelected={onToggleSessionSelected}
            onCancelSessionSelection={onCancelSessionSelection}
            onDeleteSelectedSessions={onDeleteSelectedSessions}
            t={t}
          />
        );
      })}
    </div>
  );
}
