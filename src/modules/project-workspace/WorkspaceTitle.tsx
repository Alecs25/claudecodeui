import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';

import { LLMProviderLogo } from '@/shared/ui';
import { api } from '@/shared/api';
import type { Project, ProjectSession, SessionStatusPatch } from '@/shared/types';
import type { TranscriptViewMode } from '@/shared/uiPreferences';
import { getSessionTitle } from '@/shared/utils';
import { useSessionTitleRename } from '@/modules/project-workspace/hooks/useSessionTitleRename';
import SessionMenu, { type SessionMenuProps } from '@/modules/project-workspace/session-toolbar/SessionMenu';

type WorkspaceTitleProps = {
  selectedProject: Project;
  selectedSession: ProjectSession | null;
  /** The project's checked-out branch, when it is a git repository. */
  branch?: string | null;
  isMobile?: boolean;
  /** Persists a new title for a session; resolves false when the backend refuses it. */
  onRenameSession: (sessionId: string, summary: string) => Promise<boolean>;
  viewMode?: TranscriptViewMode;
  onViewModeChange?: (mode: TranscriptViewMode) => void;
  split?: SessionMenuProps['split'];
  /** Drops the session from the lists once the backend archived it. */
  onSessionArchived?: (sessionId: string) => void;
};

/**
 * The pin and completed flags as the menu shows them: the session row's,
 * overridden by the last change made here until the server's status frame
 * reaches the row (or the selection moves on).
 */
function useSessionStatusFlags(session: ProjectSession | null) {
  const { t } = useTranslation();
  const [override, setOverride] = useState<{ sessionId: string; rowFlags: string; patch: SessionStatusPatch } | null>(null);
  const sessionId = session?.id ?? null;
  // Once the row's own flags change, the server has answered and they win.
  const rowFlags = `${Boolean(session?.isPinned)}:${Boolean(session?.isCompleted)}`;

  const pending = override && override.sessionId === sessionId && override.rowFlags === rowFlags ? override.patch : {};
  const isPinned = pending.isPinned ?? Boolean(session?.isPinned);
  const isCompleted = pending.isCompleted ?? Boolean(session?.isCompleted);

  const setStatus = useCallback(async (patch: SessionStatusPatch) => {
    if (!sessionId) {
      return;
    }
    setOverride({ sessionId, rowFlags, patch });
    try {
      const response = await api.setSessionStatus(sessionId, patch);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('[workspace] Error updating session status:', error);
      setOverride(null);
      alert(t('sidebar:messages.sessionStatusError', { defaultValue: 'Could not update the session.' }));
    }
  }, [rowFlags, sessionId, t]);

  return { isPinned, isCompleted, setStatus };
}

/**
 * Rendered by WorkspaceHeader: the session title with a caret that opens the
 * session menu (rename, pin, view, side chat, completed, side by side,
 * archive), and "project · branch" under it. Double-clicking the title still
 * renames it in place, beside the sidebar's rename.
 */
export default function WorkspaceTitle({
  selectedProject,
  selectedSession,
  branch = null,
  isMobile = false,
  onRenameSession,
  viewMode,
  onViewModeChange,
  split,
  onSessionArchived,
}: WorkspaceTitleProps) {
  const { t } = useTranslation();
  // The session the menu was opened for: switching sessions closes it.
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const isMenuOpen = Boolean(selectedSession) && menuSessionId === selectedSession?.id;
  const setMenuOpen = useCallback((open: boolean) => {
    setMenuSessionId(open ? selectedSession?.id ?? null : null);
  }, [selectedSession?.id]);
  const sessionTitle = selectedSession ? getSessionTitle(selectedSession) : '';
  const subtitle = branch ? `${selectedProject.displayName} · ${branch}` : selectedProject.displayName;
  const { isPinned, isCompleted, setStatus } = useSessionStatusFlags(selectedSession);

  const {
    isEditing: isRenaming,
    draft: renameDraft,
    isSaving: isSavingRename,
    inputRef: renameInputRef,
    startEditing: startRenaming,
    updateDraft: updateRenameDraft,
    cancelEditing: cancelRenaming,
    handleInputKeyDown: handleRenameKeyDown,
  } = useSessionTitleRename({
    sessionId: selectedSession?.id ?? null,
    currentTitle: sessionTitle,
    onRenameSession,
  });

  const archiveSession = useCallback(async () => {
    const sessionId = selectedSession?.id;
    if (!sessionId || !window.confirm(t('sessionMenu.archiveConfirm', { defaultValue: 'Archive this session?' }))) {
      return;
    }
    try {
      const response = await api.deleteSession(sessionId, false);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      onSessionArchived?.(sessionId);
    } catch (error) {
      console.error('[workspace] Error archiving session:', error);
      alert(t('sessionMenu.archiveFailed', { defaultValue: 'Could not archive the session.' }));
    }
  }, [onSessionArchived, selectedSession?.id, t]);

  if (!selectedSession) {
    return (
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold leading-tight text-foreground">{t('mainContent.newSession')}</h2>
        <div className="truncate text-[11px] leading-tight text-muted-foreground">{subtitle}</div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
        <LLMProviderLogo provider={selectedSession.__provider} className="h-4 w-4" />
      </div>

      <div className="relative min-w-0 flex-1">
        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            value={renameDraft}
            onChange={(event) => updateRenameDraft(event.target.value)}
            onKeyDown={handleRenameKeyDown}
            // Clicking anywhere else cancels, as the sidebar's rename does.
            onBlur={cancelRenaming}
            readOnly={isSavingRename}
            aria-busy={isSavingRename}
            aria-label={t('mainContent.renameSessionLabel')}
            // Blur cancels, so a touch keyboard needs a key that commits.
            enterKeyHint="done"
            className="w-full max-w-md rounded border border-border bg-background px-1.5 py-0.5 text-sm font-semibold leading-tight text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            title={t('mainContent.renameSessionHint', { title: sessionTitle })}
            onClick={() => setMenuOpen(!isMenuOpen)}
            onDoubleClick={() => {
              setMenuOpen(false);
              startRenaming();
            }}
            className="flex max-w-full items-center gap-1 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <h2 className="truncate text-sm font-semibold leading-tight text-foreground">{sessionTitle}</h2>
            <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} />
          </button>
        )}
        <div className="truncate text-[11px] leading-tight text-muted-foreground">{subtitle}</div>

        <SessionMenu
          open={isMenuOpen}
          onOpenChange={setMenuOpen}
          isMobile={isMobile}
          sessionId={selectedSession.id}
          sessionTitle={sessionTitle}
          isPinned={isPinned}
          isCompleted={isCompleted}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          onRename={startRenaming}
          onTogglePinned={() => void setStatus({ isPinned: !isPinned })}
          onToggleCompleted={() => void setStatus({ isCompleted: !isCompleted })}
          onArchive={() => void archiveSession()}
          split={split}
        />
      </div>
    </div>
  );
}
