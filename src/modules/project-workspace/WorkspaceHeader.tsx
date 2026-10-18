import type { ComponentProps } from 'react';

import type { AppTab, Project, ProjectSession } from '@/shared/types';
import MobileMenuButton from '@/modules/project-workspace/MobileMenuButton';
import WorkspaceConnectionStatus from '@/modules/project-workspace/WorkspaceConnectionStatus';
import WorkspaceTitle from '@/modules/project-workspace/WorkspaceTitle';
import WorkspaceToolbar from '@/modules/project-workspace/session-toolbar/WorkspaceToolbar';
import type { GitChangeSummary } from '@/modules/project-workspace/hooks/useGitChangeSummary';

type TitleProps = ComponentProps<typeof WorkspaceTitle>;

type WorkspaceHeaderProps = {
  activeTab: AppTab;
  /** Opens a pane beside the chat, or closes it when it is the one already open. */
  onTogglePane: (pane: AppTab) => void;
  selectedProject: Project;
  selectedSession: ProjectSession | null;
  shouldShowTasksTab: boolean;
  shouldShowBrowserTab: boolean;
  isMobile: boolean;
  onMenuClick: () => void;
  /** Persists a new title for a session; resolves false when the backend refuses it. */
  onRenameSession: (sessionId: string, summary: string) => Promise<boolean>;
  changes?: GitChangeSummary | null;
  viewMode?: TitleProps['viewMode'];
  onViewModeChange?: TitleProps['onViewModeChange'];
  split?: TitleProps['split'];
  onSessionArchived?: TitleProps['onSessionArchived'];
};

/**
 * Rendered by WorkspaceMain: the session title and its menu on the left, the
 * chat connection status, and the toolbar that opens panes beside the chat.
 */
export default function WorkspaceHeader({
  activeTab,
  onTogglePane,
  selectedProject,
  selectedSession,
  shouldShowTasksTab,
  shouldShowBrowserTab,
  isMobile,
  onMenuClick,
  onRenameSession,
  changes = null,
  viewMode,
  onViewModeChange,
  split,
  onSessionArchived,
}: WorkspaceHeaderProps) {
  return (
    <header className="pwa-header-safe flex-shrink-0 border-b border-border/60 bg-background/95 px-3 py-1.5 backdrop-blur-sm sm:px-4">
      <div className="flex min-h-10 min-w-0 items-center gap-2">
        {isMobile && <MobileMenuButton onMenuClick={onMenuClick} />}
        <WorkspaceTitle
          selectedProject={selectedProject}
          selectedSession={selectedSession}
          branch={changes?.branch ?? null}
          isMobile={isMobile}
          onRenameSession={onRenameSession}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          split={split}
          onSessionArchived={onSessionArchived}
        />
        <WorkspaceConnectionStatus />
        <WorkspaceToolbar
          activeTab={activeTab}
          onTogglePane={onTogglePane}
          changes={changes}
          shouldShowTasksTab={shouldShowTasksTab}
          shouldShowBrowserTab={shouldShowBrowserTab}
          isMobile={isMobile}
        />
      </div>
    </header>
  );
}
