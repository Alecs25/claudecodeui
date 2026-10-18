import { memo } from 'react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

import { ChatInterface } from '@/modules/chat';
import { LLMProviderLogo } from '@/shared/ui';
import type { Project, ProjectSession, SessionEstablishedContext, SessionNavigationOptions, SettingsOpenTarget } from '@/shared/types';
import WorkspaceErrorBoundary from '@/modules/project-workspace/WorkspaceErrorBoundary';

type SplitSessionPaneProps = {
  project: Project;
  session: ProjectSession;
  isActive: boolean;
  ws: WebSocket | null;
  sendMessage: (message: unknown) => void;
  onFileOpen?: ComponentProps<typeof ChatInterface>['onFileOpen'];
  onNavigateToSession: (targetSessionId: string, options?: SessionNavigationOptions) => void;
  onSessionEstablished: (sessionId: string, context: SessionEstablishedContext) => void;
  onShowSettings: (tab?: SettingsOpenTarget) => void;
  showRawParameters: boolean;
  showThinking: boolean;
  /** Follows the main pane's mode; only the main pane cycles it with Ctrl+O. */
  transcriptViewMode: ComponentProps<typeof ChatInterface>['transcriptViewMode'];
  sendByCtrlEnter: boolean;
  onClose: () => void;
};

/**
 * Rendered by WorkspaceMain beside the main chat in split view: a second, full
 * chat on another session, with a header naming it and a button back to one
 * pane. Its own session store and composer come with its ChatInterface; the
 * app-wide hooks stay with the main pane (see `isSecondaryPane`).
 */
function SplitSessionPane({
  project,
  session,
  isActive,
  ws,
  sendMessage,
  onFileOpen,
  onNavigateToSession,
  onSessionEstablished,
  onShowSettings,
  showRawParameters,
  showThinking,
  transcriptViewMode,
  sendByCtrlEnter,
  onClose,
}: SplitSessionPaneProps) {
  const { t } = useTranslation('sidebar');
  const title = (typeof session.summary === 'string' && session.summary.trim()) || session.id;
  const closeLabel = t('sessionStatus.closeSplitView', { defaultValue: 'Close split view' });

  return (
    <section
      className="flex h-full min-w-0 flex-1 flex-col border-l border-border"
      aria-label={title}
      data-testid="split-session-pane"
    >
      <header className="flex h-9 flex-shrink-0 items-center gap-2 border-b border-border px-3">
        {session.__provider && <LLMProviderLogo provider={session.__provider} className="h-3.5 w-3.5 flex-shrink-0" />}
        <span className="min-w-0 flex-1 truncate text-xs text-foreground" title={title}>{title}</span>
        <span className="hidden truncate text-[11px] text-muted-foreground lg:inline">{project.displayName}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          title={closeLabel}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1">
        <WorkspaceErrorBoundary showDetails>
          <ChatInterface
            isActive={isActive}
            selectedProject={project}
            selectedSession={session}
            ws={ws}
            sendMessage={sendMessage}
            onFileOpen={onFileOpen}
            onNavigateToSession={onNavigateToSession}
            onSessionEstablished={onSessionEstablished}
            onShowSettings={onShowSettings}
            showRawParameters={showRawParameters}
            showThinking={showThinking}
            transcriptViewMode={transcriptViewMode}
            sendByCtrlEnter={sendByCtrlEnter}
            isSecondaryPane
          />
        </WorkspaceErrorBoundary>
      </div>
    </section>
  );
}

export default memo(SplitSessionPane);
