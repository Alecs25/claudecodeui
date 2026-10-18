import { memo, useEffect } from 'react';

import { SideChatHost } from '@/modules/chat';
import {
  useProjectActiveSessionState,
  useProjectCommandState,
} from '@/modules/project-workspace/context/ProjectsStateContext';
import { START_SUGGESTED_SESSION_EVENT } from '@/shared/constants';
import type { StartSuggestedSessionDetail } from '@/shared/types';
import { WorkspaceLayoutProvider } from '@/modules/project-workspace/context/WorkspaceLayoutContext';
import ProjectEffects from '@/modules/project-workspace/controllers/ProjectEffects';
import type { ProjectWorkspaceShellProps } from '@/shared/types';
import ProjectCommandPalette from '@/modules/project-workspace/ProjectCommandPalette';
import ProjectMainRegion from '@/modules/project-workspace/ProjectMainRegion';
import ProjectQuickSettingsRegion from '@/modules/project-workspace/ProjectQuickSettingsRegion';
import ProjectSidebarRegion from '@/modules/project-workspace/ProjectSidebarRegion';
import SessionFinishedToasts from '@/modules/project-workspace/SessionFinishedToasts';

/** Rendered by ProjectWorkspaceRoute to lay out the workspace sidebar, main region and global overlays. */
function ProjectWorkspaceShell({
  isMobile,
  ws,
  sendMessage,
  navigate,
}: ProjectWorkspaceShellProps) {
  return (
    <WorkspaceLayoutProvider>
      <div
        className="fixed inset-0 flex bg-background"
        style={{ bottom: 'var(--keyboard-height, 0px)' }}
      >
        <ProjectEffects navigate={navigate} />
        <ProjectSidebarRegion isMobile={isMobile} />

        <div className="flex min-w-0 flex-1 flex-col">
          <ProjectMainRegion
            isMobile={isMobile}
            ws={ws}
            sendMessage={sendMessage}
            navigate={navigate}
          />
        </div>

        <ProjectCommandPalette />
        <SessionFinishedToasts navigate={navigate} />
        <WorkspaceSideChat />
        <SuggestedSessionStarter />
        {/* Last flex child on purpose: when pinned it docks to the right of the main region. */}
        <ProjectQuickSettingsRegion />
      </div>
    </WorkspaceLayoutProvider>
  );
}

/** Feeds the side chat the session on screen, which Ctrl+; and /btw ask about. */
function WorkspaceSideChat() {
  const { activeSessionId } = useProjectActiveSessionState();
  return <SideChatHost activeSessionId={activeSessionId} />;
}

/**
 * Opens a new session when a suggestion card asks for one; the chat module
 * already queued the prompt that the new session's composer sends.
 */
function SuggestedSessionStarter() {
  const { handleNewSession, selectedProject } = useProjectCommandState();
  useEffect(() => {
    const handleStart = (event: Event) => {
      const project = (event as CustomEvent<StartSuggestedSessionDetail>).detail?.project ?? selectedProject;
      if (project) {
        handleNewSession(project);
      }
    };
    window.addEventListener(START_SUGGESTED_SESSION_EVENT, handleStart);
    return () => window.removeEventListener(START_SUGGESTED_SESSION_EVENT, handleStart);
  }, [handleNewSession, selectedProject]);
  return null;
}

export default memo(ProjectWorkspaceShell);
