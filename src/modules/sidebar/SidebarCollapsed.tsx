import { AlertTriangle, List, PanelLeftOpen, Search, Settings, Sparkles } from 'lucide-react';
import type { TFunction } from 'i18next';

import { cn } from '@/shared/utils';
import type { Project } from '@/shared/types';
import NewSessionMenu from '@/modules/sidebar/NewSessionMenu';
import { SidebarLogoMark } from '@/modules/sidebar/SidebarHeader';

type SidebarCollapsedProps = {
  onExpand: () => void;
  onShowSettings: () => void;
  updateAvailable: boolean;
  restartRequired: boolean;
  onShowVersionModal: () => void;
  /** The new-session menu, the same one as the expanded sidebar's button. */
  projects: Project[];
  newSessionProject: Project | null;
  onNewSession: (project: Project) => void;
  onChooseFolderForSession: () => void;
  /** Whether the session list is open over the chat. */
  isSessionsOpen: boolean;
  onToggleSessions: () => void;
  /** Opens the session list with its search field. */
  onOpenSearch: () => void;
  /** Some session is unread or waiting for permission: the Sessions icon gets a dot. */
  hasSessionsNeedingAttention: boolean;
  t: TFunction;
};

const railButtonClassName =
  'group relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground';

/**
 * Rendered by Sidebar instead of SidebarContent when the panel is collapsed,
 * by hand or because a right pane needs the room: a 52px icon rail with new
 * session, the session list (opened over the chat), search and settings.
 */
export default function SidebarCollapsed({
  onExpand,
  onShowSettings,
  updateAvailable,
  restartRequired,
  onShowVersionModal,
  projects,
  newSessionProject,
  onNewSession,
  onChooseFolderForSession,
  isSessionsOpen,
  onToggleSessions,
  onOpenSearch,
  hasSessionsNeedingAttention,
  t,
}: SidebarCollapsedProps) {
  const sessionsLabel = t('sessions.title');
  const attentionLabel = t('sessions.needsAttention');
  const searchLabel = t('search.open', { defaultValue: 'Search' });
  const expandLabel = t('common:versionUpdate.ariaLabels.showSidebar');

  return (
    <nav
      className="flex h-full w-[52px] flex-col items-center gap-1.5 bg-background/80 py-3 backdrop-blur-sm"
      aria-label={sessionsLabel}
      data-testid="sidebar-rail"
    >
      <SidebarLogoMark />

      <button
        type="button"
        onClick={onExpand}
        className={railButtonClassName}
        aria-label={expandLabel}
        title={expandLabel}
      >
        <PanelLeftOpen className="h-4 w-4" />
      </button>

      <div className="nav-divider my-0.5 w-6" />

      <NewSessionMenu
        projects={projects}
        newSessionProject={newSessionProject}
        onNewSession={onNewSession}
        onChooseFolderForSession={onChooseFolderForSession}
        variant="icon"
        t={t}
      />

      <button
        type="button"
        onClick={onToggleSessions}
        className={cn(railButtonClassName, isSessionsOpen && 'bg-accent text-foreground')}
        aria-label={hasSessionsNeedingAttention ? `${sessionsLabel} · ${attentionLabel}` : sessionsLabel}
        aria-expanded={isSessionsOpen}
        title={sessionsLabel}
      >
        <List className="h-4 w-4" />
        {hasSessionsNeedingAttention && (
          <span
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-background"
            data-testid="sidebar-rail-attention-dot"
          />
        )}
      </button>

      <button
        type="button"
        onClick={onOpenSearch}
        className={railButtonClassName}
        aria-label={searchLabel}
        title={searchLabel}
      >
        <Search className="h-4 w-4" />
      </button>

      <div className="flex-1" />

      {restartRequired && (
        <div
          className="relative flex h-9 w-9 items-center justify-center rounded-lg"
          aria-label={t('version.restartRequired')}
          title={t('version.restartRequired')}
        >
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
        </div>
      )}

      {updateAvailable && (
        <button
          type="button"
          onClick={onShowVersionModal}
          className={railButtonClassName}
          aria-label={t('common:versionUpdate.ariaLabels.updateAvailable')}
          title={t('common:versionUpdate.ariaLabels.updateAvailable')}
        >
          <Sparkles className="h-4 w-4 text-blue-500" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
        </button>
      )}

      <button
        type="button"
        onClick={() => onShowSettings()}
        className={railButtonClassName}
        aria-label={t('actions.settings')}
        title={t('actions.settings')}
      >
        <Settings className="h-4 w-4" />
      </button>
    </nav>
  );
}
