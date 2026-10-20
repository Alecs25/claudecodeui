import React, { useCallback, useEffect, type Dispatch, type SetStateAction, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChatInterface, requestSessionPrompt } from '@/modules/chat';
import { FileTree } from '@/modules/file-tree';
import { StandaloneShell } from '@/modules/standalone-shell';
import { GitPanel } from '@/modules/git-panel';
import { PluginTabContent, usePlugins } from '@/modules/plugins';
import { BrowserUsePanel, useBrowserUseEnabled } from '@/modules/browser-use';
import { usePaletteOpsRegister } from '@/modules/command-palette';
import { TaskMasterPanel, useTaskMasterProjectSync, useTasksSettings } from '@/modules/task-master';
import type { AppTab, DirectoryRevealRequest, Project, ProjectSession, SessionEstablishedContext, SessionNavigationOptions, SettingsOpenTarget } from '@/shared/types';
import { useSetUiPreferences, useUiPreferences } from '@/shared/context/UiPreferencesContext';
import { getSessionTitle } from '@/shared/utils';
import {
  getTranscriptViewMode,
  getTranscriptViewModePreferences,
  type TranscriptViewMode,
} from '@/shared/uiPreferences';
import { useReportWorkspaceRightColumn } from '@/modules/project-workspace/context/WorkspaceLayoutContext';
import { useFileOpenResolver } from '@/modules/project-workspace/hooks/useFileOpenResolver';
import { EditorSidebar, FileViewer, useEditorSidebar, useFileViewer, useSentFilesAutoOpen } from '@/modules/code-editor';
import WorkspaceHeader from '@/modules/project-workspace/WorkspaceHeader';
import WorkspaceStateView from '@/modules/project-workspace/WorkspaceStateView';
import WorkspaceErrorBoundary from '@/modules/project-workspace/WorkspaceErrorBoundary';
import SplitSessionPane from '@/modules/project-workspace/SplitSessionPane';
import WorkspaceSidePane from '@/modules/project-workspace/side-pane/WorkspaceSidePane';
import ChangesPane from '@/modules/project-workspace/side-pane/ChangesPane';
import BackgroundTasksPane from '@/modules/project-workspace/side-pane/BackgroundTasksPane';
import { PANE_DEFINITIONS, type BuiltInPaneId } from '@/modules/project-workspace/session-toolbar/paneDefinitions';
import { useGitChangeSummary } from '@/modules/project-workspace/hooks/useGitChangeSummary';
import { usePaneShortcuts } from '@/modules/project-workspace/hooks/usePaneShortcuts';

type WorkspaceMainProps = {
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  activeTab: AppTab;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  ws: WebSocket | null;
  sendMessage: (message: unknown) => void;
  isMobile: boolean;
  onMenuClick: () => void;
  isLoading: boolean;
  onNavigateToSession: (targetSessionId: string, options?: SessionNavigationOptions) => void;
  onSessionEstablished: (sessionId: string, context: SessionEstablishedContext) => void;
  onShowSettings: (tab?: SettingsOpenTarget) => void;
  externalMessageUpdate: number;
  newSessionTrigger: number;
  /** Switches the app to another project — used by the git panel's Worktrees view. */
  onProjectSelect: (project: Project) => void;
  /** Silently re-syncs the sidebar project list after worktree projects change. */
  onProjectsRefresh: () => void;
  /** Persists a new title for a session; resolves false when the backend refuses it. Used by the header's inline rename. */
  onRenameSession: (sessionId: string, summary: string) => Promise<boolean>;
  /** The session shown beside the main chat in split view, or null for a single pane. */
  splitSession: { session: ProjectSession; project: Project } | null;
  onCloseSplitSession: () => void;
  /** Opens a session in the split pane; absent where the layout has no room for one. */
  onOpenSplitSession?: (session: ProjectSession) => void;
  /** Drops an archived session from the lists and leaves it if it was open. */
  onSessionArchived?: (sessionId: string) => void;
};

/**
 * Rendered by ProjectMainRegion: the session header with its toolbar, the
 * chat, and the one pane the toolbar opened (terminal, changes, preview,
 * files, git, plan, background tasks or a plugin) at its right, or over it on
 * a phone. The code editor and the split session use the same right column.
 */
function WorkspaceMain({
  selectedProject,
  selectedSession,
  activeTab,
  setActiveTab,
  ws,
  sendMessage,
  isMobile,
  onMenuClick,
  isLoading,
  onNavigateToSession,
  onSessionEstablished,
  onShowSettings,
  externalMessageUpdate,
  newSessionTrigger,
  onProjectSelect,
  onProjectsRefresh,
  onRenameSession,
  splitSession,
  onCloseSplitSession,
  onOpenSplitSession,
  onSessionArchived,
}: WorkspaceMainProps) {
  const { t } = useTranslation();
  const { plugins } = usePlugins();
  const preferences = useUiPreferences();
  const setPreferences = useSetUiPreferences();
  const { sendByCtrlEnter } = preferences;
  // The mode is the source of truth; the two booleans the transcript reads are
  // derived from it so a legacy "raw on, thinking off" pair cannot hide thinking in verbose.
  const transcriptViewMode = getTranscriptViewMode(preferences);
  const { showRawParameters, showThinking } = getTranscriptViewModePreferences(transcriptViewMode);
  const setTranscriptViewMode = useCallback((mode: TranscriptViewMode) => {
    setPreferences(getTranscriptViewModePreferences(mode));
  }, [setPreferences]);

  const { tasksEnabled, isTaskMasterInstalled } = useTasksSettings();
  const browserUseEnabled = useBrowserUseEnabled();

  useTaskMasterProjectSync(selectedProject);
  // The folder an in-chat `path/` reference asked to reveal. Held as an object
  // so that re-clicking the same folder is a new request the tree acts on.
  const [revealDirectory, setRevealDirectory] = useState<DirectoryRevealRequest | null>(null);

  const shouldShowTasksTab = Boolean(tasksEnabled && isTaskMasterInstalled);
  const shouldShowBrowserTab = browserUseEnabled;

  const {
    editingFile,
    editorWidth,
    editorExpanded,
    hasManualWidth,
    resizeHandleRef,
    handleFileOpen,
    handleCloseEditor,
    requestCloseEditor,
    handleToggleEditorExpand,
    handleResizeStart,
    handleUnsavedChangesChange,
  } = useEditorSidebar({
    selectedProject,
    isMobile,
  });
  useSentFilesAutoOpen();
  const { viewerTarget, closeViewer, dockViewerFile, openFileFromLink } = useFileViewer({
    projectId: selectedProject?.projectId,
    openInSidePanel: handleFileOpen,
  });

  // Resolves bare/partial file references (e.g. links inside chat messages) to
  // real project files before opening them: HTML pages in the central viewer,
  // everything else in the in-app editor.
  const resolvedFileOpen = useFileOpenResolver(selectedProject, openFileFromLink);

  useEffect(() => {
    if (!shouldShowTasksTab && activeTab === 'tasks') {
      setActiveTab('chat');
    }
  }, [shouldShowTasksTab, activeTab, setActiveTab]);

  useEffect(() => {
    if (!shouldShowBrowserTab && activeTab === 'browser') {
      setActiveTab('chat');
    }
  }, [shouldShowBrowserTab, activeTab, setActiveTab]);

  const { summary: gitChanges, refresh: refreshGitChanges } = useGitChangeSummary(selectedProject?.projectId);
  const isPaneOpen = activeTab !== 'chat';

  // One thing at a time in the right column: a pane takes it from the editor
  // (asking first about unsaved edits) and from the split session.
  const openPane = useCallback((pane: AppTab) => {
    if (pane !== 'chat') {
      if (!requestCloseEditor()) {
        return;
      }
      if (splitSession && !isMobile) {
        onCloseSplitSession();
      }
    }
    setActiveTab(pane);
  }, [isMobile, onCloseSplitSession, requestCloseEditor, setActiveTab, splitSession]);

  const togglePane = useCallback((pane: AppTab) => {
    if (pane === activeTab) {
      setActiveTab('chat');
      return;
    }
    openPane(pane);
  }, [activeTab, openPane, setActiveTab]);

  const closePane = useCallback(() => {
    setActiveTab('chat');
  }, [setActiveTab]);

  usePaneShortcuts(Boolean(selectedProject), togglePane);

  // "Open side by side" puts the session viewed before this one next to it.
  // Tracked during render (React's "adjust state on prop change" pattern), so
  // the menu is right on the first render after a switch.
  const [previousSession, setPreviousSession] = useState<ProjectSession | null>(null);
  const [lastSession, setLastSession] = useState<ProjectSession | null>(selectedSession);
  if (selectedSession?.id !== lastSession?.id) {
    if (lastSession && selectedSession) {
      setPreviousSession(lastSession);
    }
    setLastSession(selectedSession);
  }

  const splitMenu = isMobile || !onOpenSplitSession ? undefined : {
    isOpen: Boolean(splitSession),
    canOpen: Boolean(previousSession && previousSession.id !== selectedSession?.id),
    onToggle: () => {
      if (splitSession) {
        onCloseSplitSession();
      } else if (previousSession) {
        onOpenSplitSession(previousSession);
      }
    },
  };

  const selectedSessionId = selectedSession?.id ?? null;
  const sendDiffComments = useCallback((prompt: string) => {
    if (!selectedSessionId) {
      return;
    }
    requestSessionPrompt(selectedSessionId, prompt);
    // On a phone the pane covers the chat the answer arrives in.
    if (isMobile) {
      setActiveTab('chat');
    }
  }, [isMobile, selectedSessionId, setActiveTab]);

  const askAboutViewerFile = useCallback((prompt: string) => {
    if (selectedSessionId) {
      requestSessionPrompt(selectedSessionId, prompt);
    }
  }, [selectedSessionId]);

  // Stable so React.memo(ChatInterface) can bail out: an inline arrow here made
  // every WorkspaceMain render re-render the whole chat tree, including during
  // an editor-divider drag.
  const showAllTasks = useCallback(() => {
    openPane('tasks');
  }, [openPane]);

  const openFile = useCallback((filePath: string) => {
    handleFileOpen(filePath);
  }, [handleFileOpen]);

  // Opens the editor side panel in place, keeping the current tab (e.g. chat).
  const openFileInEditor = useCallback((filePath: string, line?: number | null) => {
    resolvedFileOpen(filePath, undefined, line);
  }, [resolvedFileOpen]);

  // Directories cannot be read as text: reveal them in the file tree instead.
  const openDirectory = useCallback((directoryPath: string) => {
    openPane('files');
    setRevealDirectory({ path: directoryPath });
  }, [openPane]);

  // Stable arguments keep usePaletteOpsRegister's effect from tearing down and
  // rewriting the whole palette registry on every render.
  usePaletteOpsRegister({ openFile, openFileInEditor, openDirectory });

  // What sits right of the chat, for the sidebar's auto-collapse to the rail.
  // A phone has no docked column: panes and the editor cover the chat there.
  const rightColumnKey = (() => {
    if (isMobile || !selectedProject) return null;
    if (editingFile) return 'editor';
    if (isPaneOpen) return `pane:${activeTab}`;
    if (splitSession) return 'split';
    return null;
  })();
  useReportWorkspaceRightColumn(rightColumnKey, rightColumnKey === 'split' ? 'split' : editorWidth);

  if (isLoading) {
    return <WorkspaceStateView mode="loading" isMobile={isMobile} onMenuClick={onMenuClick} />;
  }

  if (!selectedProject) {
    return <WorkspaceStateView mode="empty" isMobile={isMobile} onMenuClick={onMenuClick} />;
  }

  const paneTitle = (() => {
    if (activeTab.startsWith('plugin:')) {
      const pluginName = activeTab.replace('plugin:', '');
      return plugins.find((plugin) => plugin.name === pluginName)?.displayName ?? pluginName;
    }
    const definition = PANE_DEFINITIONS[activeTab as BuiltInPaneId];
    return definition ? t(definition.labelKey, { defaultValue: definition.defaultLabel }) : '';
  })();

  const renderPaneContent = () => {
    switch (activeTab) {
      case 'shell':
        return (
          <StandaloneShell
            project={selectedProject}
            session={selectedSession}
            showHeader={false}
            isActive
          />
        );
      case 'files':
        return (
          <FileTree
            selectedProject={selectedProject}
            onFileOpen={handleFileOpen}
            revealDirectory={revealDirectory}
          />
        );
      case 'git':
        return (
          <GitPanel
            selectedProject={selectedProject}
            isMobile={isMobile}
            onFileOpen={handleFileOpen}
            onProjectSelect={onProjectSelect}
            onProjectsRefresh={onProjectsRefresh}
          />
        );
      case 'tasks':
        return shouldShowTasksTab ? <TaskMasterPanel isVisible /> : null;
      case 'browser':
        return shouldShowBrowserTab ? <BrowserUsePanel isVisible onShowSettings={onShowSettings} /> : null;
      case 'diff':
        return (
          <ChangesPane
            // Comments point at lines of one project's diff: another project starts clean.
            key={selectedProject.projectId}
            projectId={selectedProject.projectId}
            changes={gitChanges}
            onRefresh={refreshGitChanges}
            onSendComments={selectedSession ? sendDiffComments : undefined}
            isMobile={isMobile}
          />
        );
      case 'background':
        return (
          <BackgroundTasksPane
            sessionId={selectedSession?.id ?? null}
            onTaskOpened={isMobile ? closePane : undefined}
          />
        );
      default:
        return activeTab.startsWith('plugin:') ? (
          <PluginTabContent
            pluginName={activeTab.replace('plugin:', '')}
            selectedProject={selectedProject}
            selectedSession={selectedSession}
          />
        ) : null;
    }
  };

  // The editor and a pane share the right column; the editor, opened from a
  // link or the file tree, sits on top and the pane comes back when it closes.
  const showSidePane = isPaneOpen && (isMobile || !editingFile);
  // On a phone the pane covers the chat, which stays mounted underneath.
  const isChatVisible = !(isMobile && isPaneOpen);

  return (
    <div className="flex h-full flex-col">
      <WorkspaceHeader
        activeTab={activeTab}
        onTogglePane={togglePane}
        selectedProject={selectedProject}
        selectedSession={selectedSession}
        shouldShowTasksTab={shouldShowTasksTab}
        shouldShowBrowserTab={shouldShowBrowserTab}
        isMobile={isMobile}
        onMenuClick={onMenuClick}
        onRenameSession={onRenameSession}
        changes={gitChanges}
        viewMode={transcriptViewMode}
        onViewModeChange={setTranscriptViewMode}
        split={splitMenu}
        onSessionArchived={onSessionArchived}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className={`flex min-h-0 min-w-[200px] flex-1 overflow-hidden ${editorExpanded ? 'hidden' : ''}`}>
          <div className="h-full min-w-0 flex-1">
            <WorkspaceErrorBoundary showDetails>
              <ChatInterface
                isActive={isChatVisible}
                selectedProject={selectedProject}
                selectedSession={selectedSession}
                ws={ws}
                sendMessage={sendMessage}
                onFileOpen={handleFileOpen}
                onNavigateToSession={onNavigateToSession}
                onSessionEstablished={onSessionEstablished}
                onShowSettings={onShowSettings}
                showRawParameters={showRawParameters}
                showThinking={showThinking}
                transcriptViewMode={transcriptViewMode}
                onTranscriptViewModeChange={setTranscriptViewMode}
                sendByCtrlEnter={sendByCtrlEnter}
                externalMessageUpdate={externalMessageUpdate}
                newSessionTrigger={newSessionTrigger}
                onShowAllTasks={tasksEnabled ? showAllTasks : null}
              />
            </WorkspaceErrorBoundary>
          </div>
          {splitSession && (
            <SplitSessionPane
              project={splitSession.project}
              session={splitSession.session}
              isActive={isChatVisible}
              ws={ws}
              sendMessage={sendMessage}
              // The editor resolves paths against the main project, so links
              // from a session of another project are not opened there.
              onFileOpen={splitSession.project.projectId === selectedProject.projectId ? handleFileOpen : undefined}
              onNavigateToSession={onNavigateToSession}
              onSessionEstablished={onSessionEstablished}
              onShowSettings={onShowSettings}
              showRawParameters={showRawParameters}
              showThinking={showThinking}
              transcriptViewMode={transcriptViewMode}
              sendByCtrlEnter={sendByCtrlEnter}
              onClose={onCloseSplitSession}
            />
          )}
        </div>

        {showSidePane && (
          <WorkspaceSidePane
            title={paneTitle}
            isMobile={isMobile}
            width={editorWidth}
            resizeHandleRef={resizeHandleRef}
            onResizeStart={handleResizeStart}
            onClose={closePane}
          >
            {renderPaneContent()}
          </WorkspaceSidePane>
        )}

        <EditorSidebar
          editingFile={editingFile}
          isMobile={isMobile}
          editorExpanded={editorExpanded}
          editorWidth={editorWidth}
          hasManualWidth={hasManualWidth}
          resizeHandleRef={resizeHandleRef}
          onResizeStart={handleResizeStart}
          onCloseEditor={handleCloseEditor}
          onToggleEditorExpand={handleToggleEditorExpand}
          onUnsavedChangesChange={handleUnsavedChangesChange}
          projectPath={selectedProject.path}
        />
      </div>

      {viewerTarget && (
        <FileViewer
          // A new file starts on its rendered view with a fresh question field.
          key={viewerTarget.source === 'sent' ? viewerTarget.file.id : viewerTarget.path}
          target={viewerTarget}
          sessionLabel={selectedSession ? getSessionTitle(selectedSession) : null}
          isMobile={isMobile}
          onAsk={selectedSessionId ? askAboutViewerFile : undefined}
          onDock={dockViewerFile}
          onClose={closeViewer}
        />
      )}
    </div>
  );
}

export default React.memo(WorkspaceMain);
