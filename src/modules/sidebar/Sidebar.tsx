import { memo, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useDeviceSettings } from '@/shared/hooks/useDeviceSettings';
import { useVersionCheck } from '@/shared/hooks/useVersionCheck';
import { useUiPreferences, useSetUiPreference } from '@/shared/context/UiPreferencesContext';
import { useSidebarController } from '@/modules/sidebar/hooks/useSidebarController';
import { useTaskMaster, useTasksSettings } from '@/modules/task-master';
import { usePaletteOps } from '@/modules/command-palette';
import { useBackgroundSessionIdSet, useBusySessionIdSet } from '@/shared/context/SessionProtectionContext';
import WebSocketContext from '@/shared/context/WebSocketContext';
import type { LLMProvider, LoadingProgress, MCPServerStatus, Project, ProjectSession, SessionStatusPatch, SettingsOpenTarget, SessionWithProvider, SidebarProjectListProps } from '@/shared/types';
import SidebarCollapsed from '@/modules/sidebar/SidebarCollapsed';
import SidebarContent from '@/modules/sidebar/SidebarContent';
import SidebarModals from '@/modules/sidebar/SidebarModals';

type SidebarProps = {
  projects: Project[];
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  attentionSessionIds: ReadonlySet<string>;
  onProjectSelect: (project: Project) => void;
  onSessionSelect: (session: ProjectSession) => void;
  onNewSession: (project: Project) => void;
  onSessionDelete?: (sessionId: string) => void;
  onLoadMoreSessions?: (projectId: string) => Promise<void> | void;
  // `projectId` is the DB identifier; the sidebar hands it back to the parent
  // when the delete flow completes.
  onProjectDelete?: (projectId: string) => void;
  /** Opens a session in the second pane; absent below the split-view breakpoint. */
  onOpenInSplitView?: (session: ProjectSession) => void;
  isLoading: boolean;
  loadingProgress: LoadingProgress | null;
  onRefresh: () => Promise<void> | void;
  /** Opens Settings, at `tab` when given ("agents:mcp" opens the agents tab on its MCP section). */
  onShowSettings: (tab?: SettingsOpenTarget) => void;
  showSettings: boolean;
  settingsInitialTab: string;
  onCloseSettings: () => void;
  isMobile: boolean;
  /** Closes the phone drawer; absent where the sidebar is docked. */
  onCloseSidebar?: () => void;
};

type TaskMasterSidebarContext = {
  setCurrentProject: (project: Project) => void;
  mcpServerStatus: MCPServerStatus;
};

/** Exported through the sidebar barrel; the project-workspace module renders it as the app's project and session navigation panel. */
function Sidebar({
  projects,
  selectedProject,
  selectedSession,
  attentionSessionIds,
  onProjectSelect,
  onSessionSelect,
  onNewSession,
  onSessionDelete,
  onLoadMoreSessions,
  onProjectDelete,
  onOpenInSplitView,
  isLoading,
  loadingProgress,
  onRefresh,
  onShowSettings,
  showSettings,
  settingsInitialTab,
  onCloseSettings,
  isMobile,
  onCloseSidebar,
}: SidebarProps) {
  const { t } = useTranslation(['sidebar', 'common']);
  const { isPWA } = useDeviceSettings({ trackMobile: false });
  const { updateAvailable, restartRequired, latestVersion, currentVersion, releaseInfo, installMode } = useVersionCheck(
    'siteboon',
    'claudecodeui',
  );
  const preferences = useUiPreferences();
  const setPreference = useSetUiPreference();
  const { sidebarVisible } = preferences;
  const { setCurrentProject, mcpServerStatus } = useTaskMaster() as TaskMasterSidebarContext;
  const { tasksEnabled } = useTasksSettings();
  const paletteOps = usePaletteOps();
  // Only membership is rendered here, so subscribing to the full activity map
  // would re-render the whole tree on every provider status frame.
  const activeSessions = useBusySessionIdSet();
  const backgroundSessionIds = useBackgroundSessionIdSet();
  const subscribe = useContext(WebSocketContext)?.subscribe;

  const {
    isSidebarCollapsed,
    isProjectExpanded,
    activeRename,
    showNewProject,
    initialSessionsLoaded,
    currentTime,
    isRefreshing,
    searchFilter,
    conversationResults,
    isSearching,
    searchProgress,
    deletingProjects,
    pendingDeletion,
    showVersionModal,
    filteredProjects,
    sortedProjects,
    waitingSessionIds,
    archivedProjects,
    archivedSessions,
    archivedSessionsCount,
    isArchivedSessionsLoading,
    recentConversations,
    recentConversationsHasMore,
    isRecentConversationsLoading,
    isLoadingMoreRecentConversations,
    recentConversationsError,
    reloadRecentConversations,
    loadMoreRecentConversations,
    toggleProject,
    handleSessionClick,
    toggleStarProject,
    isProjectStarred,
    getProjectSessions,
    loadingMoreProjects,
    loadMoreSessionsForProject,
    startEditingProject,
    startEditingSession,
    updateRenameDraft,
    cancelRename,
    saveProjectName,
    showDeleteSessionConfirmation,
    confirmDeleteSession,
    archiveSession,
    sessionSelection,
    setProjectSessionSelection,
    toggleSessionSelected,
    cancelSessionSelection,
    showDeleteSelectedSessionsConfirmation,
    confirmDeleteSessions,
    requestProjectDelete,
    confirmDeleteProject,
    handleProjectSelect,
    openArchivedSession,
    restoreArchivedProject,
    restoreArchivedSession,
    refreshProjects,
    updateSessionSummary,
    forkSession,
    setSessionStatus,
    statusFilter,
    setStatusFilter,
    projectFilter,
    setProjectFilter,
    groupByProject,
    setGroupByProject,
    usesServerRecents,
    localFlatConversations,
    isArchiveOpen,
    openArchive,
    closeArchive,
    isSearchOpen,
    toggleSearch,
    collapseSidebar: handleCollapseSidebar,
    expandSidebar: handleExpandSidebar,
    setShowNewProject,
    setSearchFilter,
    setPendingDeletion,
    setShowVersionModal,
  } = useSidebarController({
    projects,
    selectedProject,
    selectedSession,
    activeSessions,
    backgroundSessionIds,
    attentionSessionIds,
    isLoading,
    isMobile,
    t,
    onRefresh,
    onProjectSelect,
    onSessionSelect,
    onSessionDelete,
    onLoadMoreSessions,
    onProjectDelete,
    setCurrentProject,
    setSidebarVisible: (visible) => setPreference('sidebarVisible', visible),
    sidebarVisible,
    subscribe,
  });

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.classList.toggle('pwa-mode', isPWA);
    document.body.classList.toggle('pwa-mode', isPWA);
  }, [isPWA]);

  // "Choose folder" under New session: the folder becomes a project, and once
  // it shows up in the list a session starts in it, as if it had been picked.
  const startSessionAfterCreateRef = useRef(false);
  const [pendingSessionProject, setPendingSessionProject] = useState<{ id?: string; path?: string } | null>(null);

  const handleChooseFolderForSession = useCallback(() => {
    startSessionAfterCreateRef.current = true;
    setShowNewProject(true);
  }, [setShowNewProject]);

  const handleCloseNewProject = useCallback(() => {
    startSessionAfterCreateRef.current = false;
    setShowNewProject(false);
  }, [setShowNewProject]);

  const handleProjectCreated = (project?: Record<string, unknown>) => {
    if (startSessionAfterCreateRef.current && project) {
      const id = typeof project.projectId === 'string' ? project.projectId : undefined;
      const fullPath = typeof project.fullPath === 'string' ? project.fullPath : undefined;
      const path = fullPath ?? (typeof project.path === 'string' ? project.path : undefined);
      setPendingSessionProject({ id, path });
    }
    startSessionAfterCreateRef.current = false;
    void paletteOps.refreshProjects();
  };

  // Stable so memo() on the row components can bail out; an inline arrow here
  // would give every row a new callback on each sidebar render.
  const handleSaveProjectName = useCallback((projectId: string, nextName: string) => {
    void saveProjectName(projectId, nextName);
  }, [saveProjectName]);

  const handleSaveSessionName = useCallback(
    (projectName: string, sessionId: string, summary: string, provider: LLMProvider) => {
      void updateSessionSummary(projectName, sessionId, summary, provider);
    },
    [updateSessionSummary],
  );

  const handleSetSessionStatus = useCallback((sessionId: string, patch: SessionStatusPatch) => {
    void setSessionStatus(sessionId, patch);
  }, [setSessionStatus]);

  // On a phone the drawer covers the session, so picking one closes it.
  const handleRowSessionSelect = useCallback((session: SessionWithProvider, projectId: string) => {
    handleSessionClick(session, projectId);
    if (isMobile) {
      onCloseSidebar?.();
    }
  }, [handleSessionClick, isMobile, onCloseSidebar]);

  // "New session" starts in the project in view, else in the one the list is
  // narrowed to; with neither it asks.
  const newSessionProject = selectedProject
    ?? (projectFilter ? sortedProjects.find((project) => project.projectId === projectFilter) ?? null : null);

  useEffect(() => {
    if (!pendingSessionProject) {
      return;
    }
    const created = sortedProjects.find((project) => (
      (pendingSessionProject.id && project.projectId === pendingSessionProject.id)
      || (pendingSessionProject.path && (project.fullPath === pendingSessionProject.path || project.path === pendingSessionProject.path))
    ));
    if (!created) {
      return;
    }
    setPendingSessionProject(null);
    onNewSession(created);
  }, [onNewSession, pendingSessionProject, sortedProjects]);

  // Ctrl/Cmd+N, as in Claude Code. A browser tab keeps the shortcut for a new
  // window; installed (PWA/desktop) windows hand it to the page.
  useEffect(() => {
    if (!newSessionProject) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const isNewSessionShortcut = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey
        && event.key.toLowerCase() === 'n';
      if (!isNewSessionShortcut) {
        return;
      }
      event.preventDefault();
      onNewSession(newSessionProject);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [newSessionProject, onNewSession]);

  // Stable for the memoized rows; undefined hides the menu entry entirely.
  const handleOpenInSplitView = useCallback((session: SessionWithProvider) => {
    onOpenInSplitView?.(session);
  }, [onOpenInSplitView]);

  const projectListProps: SidebarProjectListProps = {
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
    loadingMoreProjects,
    activeSessions,
    backgroundSessionIds,
    attentionSessionIds,
    waitingSessionIds,
    isProjectStarred,
    onRenameDraftChange: updateRenameDraft,
    onToggleProject: toggleProject,
    onProjectSelect: handleProjectSelect,
    onToggleStarProject: toggleStarProject,
    onStartEditingProject: startEditingProject,
    onCancelEditingProject: cancelRename,
    onSaveProjectName: handleSaveProjectName,
    onDeleteProject: requestProjectDelete,
    onSessionSelect: handleRowSessionSelect,
    onDeleteSession: showDeleteSessionConfirmation,
    onArchiveSession: archiveSession,
    onForkSession: forkSession,
    onSetSessionStatus: handleSetSessionStatus,
    onOpenInSplitView: onOpenInSplitView ? handleOpenInSplitView : undefined,
    onLoadMoreSessions: loadMoreSessionsForProject,
    onNewSession,
    onStartEditingSession: startEditingSession,
    onCancelEditingSession: cancelRename,
    onSaveEditingSession: handleSaveSessionName,
    sessionSelection,
    onSetSessionSelection: setProjectSessionSelection,
    onToggleSessionSelected: toggleSessionSelected,
    onCancelSessionSelection: cancelSessionSelection,
    onDeleteSelectedSessions: showDeleteSelectedSessionsConfirmation,
    t,
  };

  return (
    <>
        <SidebarModals
          projects={projects}
        showSettings={showSettings}
        settingsInitialTab={settingsInitialTab}
        onCloseSettings={onCloseSettings}
        showNewProject={showNewProject}
        onCloseNewProject={handleCloseNewProject}
        onProjectCreated={handleProjectCreated}
        pendingDeletion={pendingDeletion}
        onCancelDeletion={() => setPendingDeletion(null)}
        onConfirmDeleteProject={confirmDeleteProject}
        onConfirmDeleteSession={confirmDeleteSession}
        onConfirmDeleteSessions={confirmDeleteSessions}
        showVersionModal={showVersionModal}
        onCloseVersionModal={() => setShowVersionModal(false)}
        releaseInfo={releaseInfo}
        currentVersion={currentVersion}
        latestVersion={latestVersion}
        installMode={installMode}
        t={t}
      />

      {isSidebarCollapsed ? (
        <SidebarCollapsed
          onExpand={handleExpandSidebar}
          onShowSettings={onShowSettings}
          updateAvailable={updateAvailable}
          restartRequired={restartRequired}
          onShowVersionModal={() => setShowVersionModal(true)}
          t={t}
        />
      ) : (
        <>
        <SidebarContent
            isPWA={isPWA}
            isMobile={isMobile}
            sortedProjects={sortedProjects}
            newSessionProject={newSessionProject}
            onNewSession={onNewSession}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            projectFilter={projectFilter}
            onProjectFilterChange={setProjectFilter}
            groupByProject={groupByProject}
            onGroupByProjectChange={setGroupByProject}
            isSearchOpen={isSearchOpen}
            onToggleSearch={toggleSearch}
            searchFilter={searchFilter}
            onSearchFilterChange={setSearchFilter}
            conversationResults={conversationResults}
            isSearching={isSearching}
            searchProgress={searchProgress}
            isArchiveOpen={isArchiveOpen}
            onOpenArchive={openArchive}
            onCloseArchive={closeArchive}
            archivedProjects={archivedProjects}
            archivedSessions={archivedSessions}
            archivedSessionsCount={archivedSessionsCount}
            isArchivedSessionsLoading={isArchivedSessionsLoading}
            onRestoreArchivedProject={restoreArchivedProject}
            onArchivedSessionClick={openArchivedSession}
            onRestoreArchivedSession={restoreArchivedSession}
            onDeleteArchivedSession={(session) => {
              showDeleteSessionConfirmation(
                session.sessionId,
                session.sessionTitle,
                { isArchived: true },
              );
            }}
            flatConversations={usesServerRecents ? recentConversations : localFlatConversations}
            flatHasMore={usesServerRecents && recentConversationsHasMore}
            isFlatLoading={usesServerRecents && isRecentConversationsLoading}
            isLoadingMoreFlat={isLoadingMoreRecentConversations}
            flatError={usesServerRecents && recentConversationsError}
            onLoadMoreFlat={loadMoreRecentConversations}
            onRetryFlat={reloadRecentConversations}
            onConversationResultClick={(projectId: string | null, sessionId: string, provider: string, messageTimestamp?: string | null, messageSnippet?: string | null) => {
              // `projectId` (DB key) is the canonical identifier post-migration.
              // The server emits null when it can't resolve a project row for
              // the search hit; treat that as "no project" and still navigate
              // to the session so the user can open it from the URL.
              const resolvedProvider = (provider || 'claude') as LLMProvider;
              const project = projectId ? projects.find(p => p.projectId === projectId) : null;
              const searchTarget = { __searchTargetTimestamp: messageTimestamp || null, __searchTargetSnippet: messageSnippet || null };
              const sessionObj = {
                id: sessionId,
                __provider: resolvedProvider,
                __projectId: projectId ?? undefined,
                ...searchTarget,
              };
              if (project) {
                handleProjectSelect(project);
                const sessions = getProjectSessions(project);
                const existing = sessions.find(s => s.id === sessionId);
                if (existing) {
                  handleSessionClick({ ...existing, ...searchTarget }, project.projectId);
                } else {
                  handleSessionClick(sessionObj, project.projectId);
                }
              } else {
                handleSessionClick(sessionObj, projectId ?? '');
              }
              if (isMobile) {
                onCloseSidebar?.();
              }
            }}
            onRefresh={() => {
              void refreshProjects();
            }}
            isRefreshing={isRefreshing}
            onCreateProject={() => setShowNewProject(true)}
            onChooseFolderForSession={handleChooseFolderForSession}
            onCollapseSidebar={handleCollapseSidebar}
            onCloseSidebar={onCloseSidebar}
            updateAvailable={updateAvailable}
            restartRequired={restartRequired}
            releaseInfo={releaseInfo}
            latestVersion={latestVersion}
            currentVersion={currentVersion}
            onShowVersionModal={() => setShowVersionModal(true)}
            onShowSettings={onShowSettings}
            projectListProps={projectListProps}
            t={t}
          />
        </>
      )}

    </>
  );
}

export default memo(Sidebar);
