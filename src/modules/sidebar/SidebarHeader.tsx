import { Archive, ArrowLeft, ChevronDown, FolderPlus, ListTree, MoreHorizontal, PanelLeftClose, RefreshCw, Search, X } from 'lucide-react';
import type { TFunction } from 'i18next';

import { ActionMenu, Input } from '@/shared/ui';
import { CLOUDCLI_WORDMARK_FONT_FAMILY } from '@/shared/constants';
import { IS_PLATFORM, cn } from '@/shared/utils';
import type { Project, SessionStatusFilter } from '@/shared/types';

import { SIDEBAR_VIEW_FILTERS_ENABLED } from '@/modules/sidebar/hooks/useSidebarViewPreferences';
import NewSessionMenu from '@/modules/sidebar/NewSessionMenu';

const STATUS_FILTERS: SessionStatusFilter[] = ['all', 'running', 'waiting', 'unread', 'pinned', 'completed'];

const STATUS_FILTER_DEFAULT_LABELS: Record<SessionStatusFilter, string> = {
  all: 'All',
  running: 'Running',
  waiting: 'Waiting for permission',
  unread: 'Unread',
  pinned: 'Pinned',
  completed: 'Completed',
};

// Holds the `select` value for "every project"; no projectId is empty.
const ALL_PROJECTS_VALUE = '';

type SidebarHeaderProps = {
  isPWA: boolean;
  isMobile: boolean;
  /** Hides the docked panel (tablet and up). */
  onCollapseSidebar: () => void;
  /** Closes the drawer (phone) or the rail's overlay panel; absent where the sidebar is docked. */
  onCloseSidebar?: () => void;
  isSearchOpen: boolean;
  onToggleSearch: () => void;
  searchFilter: string;
  onSearchFilterChange: (value: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onCreateProject: () => void;
  /** Picks any folder (it becomes a project) and starts a session there. */
  onChooseFolderForSession: () => void;
  isArchiveOpen: boolean;
  onOpenArchive: () => void;
  onCloseArchive: () => void;
  archivedCount: number;
  /** The projects in sidebar order, for the project filter and the new-session picker. */
  projects: Project[];
  /** Where "New session" starts one; null makes the button ask. */
  newSessionProject: Project | null;
  onNewSession: (project: Project) => void;
  statusFilter: SessionStatusFilter;
  onStatusFilterChange: (filter: SessionStatusFilter) => void;
  projectFilter: string | null;
  onProjectFilterChange: (projectId: string | null) => void;
  groupByProject: boolean;
  onGroupByProjectChange: (grouped: boolean) => void;
  t: TFunction;
};

/** The app's chat-bubble mark; also tops the collapsed rail. */
export function SidebarLogoMark() {
  return (
    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary/90 shadow-sm" aria-hidden="true">
      <svg className="h-3.5 w-3.5 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </div>
  );
}

/** Module-level, not a nested render function, so the wordmark is not remounted on every SidebarHeader render. */
function LogoBlock({ t }: { t: TFunction }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <SidebarLogoMark />
      <h1
        className="truncate text-sm font-bold tracking-tight text-foreground"
        style={{ fontFamily: CLOUDCLI_WORDMARK_FONT_FAMILY }}
      >
        {t('app.title')}
      </h1>
    </div>
  );
}

/**
 * A filter pill that is a native select underneath: the label shows the
 * choice, and the transparent select on top opens the platform's own picker,
 * which is what a finger expects on a phone.
 */
function FilterSelect({
  label,
  valueLabel,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  valueLabel: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  testId: string;
}) {
  return (
    <label className="relative flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-lg border border-border/70 px-2 text-xs text-muted-foreground focus-within:ring-1 focus-within:ring-primary hover:text-foreground">
      <span className="min-w-0 flex-1 truncate">
        {label}: <span className="text-foreground">{valueLabel}</span>
      </span>
      <ChevronDown className="h-3 w-3 flex-shrink-0" />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        data-testid={testId}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

const iconButtonClassName =
  'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';

/**
 * Rendered by SidebarContent at the top of the panel: logo, search, the
 * overflow menu (new project, refresh, archive), collapse or close, the
 * "New session" button and the filter row. One layout at every width; only
 * the collapse/close button changes.
 */
export default function SidebarHeader({
  isPWA,
  isMobile,
  onCollapseSidebar,
  onCloseSidebar,
  isSearchOpen,
  onToggleSearch,
  searchFilter,
  onSearchFilterChange,
  onRefresh,
  isRefreshing,
  onCreateProject,
  onChooseFolderForSession,
  isArchiveOpen,
  onOpenArchive,
  onCloseArchive,
  archivedCount,
  projects,
  newSessionProject,
  onNewSession,
  statusFilter,
  onStatusFilterChange,
  projectFilter,
  onProjectFilterChange,
  groupByProject,
  onGroupByProjectChange,
  t,
}: SidebarHeaderProps) {
  const statusLabel = t('filters.status', { defaultValue: 'Status' });
  const projectLabel = t('filters.project', { defaultValue: 'Project' });
  const statusOptions = STATUS_FILTERS.map((filter) => ({
    value: filter,
    label: t(`recent.status.${filter}`, { defaultValue: STATUS_FILTER_DEFAULT_LABELS[filter] }),
  }));
  const allProjectsLabel = t('filters.allProjects', { defaultValue: 'All' });
  const projectOptions = [
    { value: ALL_PROJECTS_VALUE, label: allProjectsLabel },
    ...projects.map((project) => ({ value: project.projectId, label: project.displayName })),
  ];
  const selectedProjectOption = projectOptions.find((option) => option.value === (projectFilter ?? ALL_PROJECTS_VALUE));
  const groupLabel = t('filters.groupByProject', { defaultValue: 'Group by project' });
  const searchLabel = t('search.open', { defaultValue: 'Search' });
  const moreLabel = t('actions.more', { defaultValue: 'More' });
  const closeLabel = onCloseSidebar
    ? t('actions.close', { defaultValue: 'Close' })
    : t('tooltips.hideSidebar');

  return (
    <div className="flex-shrink-0">
      <div
        className="flex items-center gap-1 px-3 pb-2 pt-3"
        style={isPWA && isMobile ? { paddingTop: '16px' } : undefined}
      >
        <div className="min-w-0 flex-1">
          {IS_PLATFORM ? (
            <a
              href="https://cloudcli.ai/dashboard"
              className="flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-80"
              title={t('tooltips.viewEnvironments')}
            >
              <LogoBlock t={t} />
            </a>
          ) : (
            <LogoBlock t={t} />
          )}
        </div>

        <button
          type="button"
          className={cn(iconButtonClassName, isSearchOpen && 'bg-accent text-foreground')}
          onClick={onToggleSearch}
          aria-pressed={isSearchOpen}
          aria-label={searchLabel}
          title={searchLabel}
        >
          <Search className="h-4 w-4" />
        </button>
        <ActionMenu
          label={moreLabel}
          ariaLabel={moreLabel}
          icon={MoreHorizontal}
          iconOnly
          portal
          variant="ghost"
          size="icon"
          triggerClassName="h-8 w-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          menuClassName="w-[240px] rounded-xl p-1.5 shadow-xl"
          items={[
            {
              key: 'new-project',
              label: t('tooltips.createProject'),
              icon: FolderPlus,
              onSelect: onCreateProject,
            },
            {
              key: 'refresh',
              label: t('actions.refresh'),
              icon: RefreshCw,
              loading: isRefreshing,
              onSelect: onRefresh,
            },
            {
              key: 'archive',
              label: archivedCount > 0
                ? `${t('archived.title', 'Archive')} (${archivedCount})`
                : t('archived.title', 'Archive'),
              icon: Archive,
              onSelect: onOpenArchive,
            },
          ]}
        />
        {onCloseSidebar ? (
          <button type="button" className={iconButtonClassName} onClick={onCloseSidebar} aria-label={closeLabel} title={closeLabel}>
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" className={iconButtonClassName} onClick={onCollapseSidebar} aria-label={closeLabel} title={closeLabel}>
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="px-3 pb-2">
        {/* Ctrl/Cmd+N skips the question and uses the folder in view. */}
        <NewSessionMenu
          projects={projects}
          newSessionProject={newSessionProject}
          onNewSession={onNewSession}
          onChooseFolderForSession={onChooseFolderForSession}
          variant="button"
          t={t}
        />
      </div>

      {isSearchOpen && (
        <div className="px-3 pb-2"><div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            type="text"
            placeholder={t('search.conversationsPlaceholder')}
            value={searchFilter}
            onChange={(event) => onSearchFilterChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                onToggleSearch();
              }
            }}
            autoFocus
            aria-label={searchLabel}
            className="nav-search-input h-9 rounded-xl border-0 pl-9 pr-9 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:ring-offset-0"
            style={isMobile ? { fontSize: '16px' } : undefined}
          />
          <button
            type="button"
            onClick={onToggleSearch}
            aria-label={t('tooltips.clearSearch')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 hover:bg-accent"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div></div>
      )}

      {isArchiveOpen ? (
        <div className="flex items-center gap-1 px-2 pb-2">
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-foreground hover:bg-accent"
            onClick={onCloseArchive}
          >
            <ArrowLeft className="h-4 w-4" />
            {t('archived.title', 'Archive')}
          </button>
          <span className="ml-auto pr-2 text-xs tabular-nums text-muted-foreground">{archivedCount}</span>
        </div>
      ) : SIDEBAR_VIEW_FILTERS_ENABLED ? (
        <div className="flex items-center gap-1.5 px-3 pb-2">
          <FilterSelect
            label={statusLabel}
            valueLabel={statusOptions.find((option) => option.value === statusFilter)?.label ?? ''}
            value={statusFilter}
            options={statusOptions}
            onChange={(value) => onStatusFilterChange(value as SessionStatusFilter)}
            testId="sidebar-status-filter"
          />
          <FilterSelect
            label={projectLabel}
            valueLabel={selectedProjectOption?.label ?? allProjectsLabel}
            value={selectedProjectOption?.value ?? ALL_PROJECTS_VALUE}
            options={projectOptions}
            onChange={(value) => onProjectFilterChange(value === ALL_PROJECTS_VALUE ? null : value)}
            testId="sidebar-project-filter"
          />
          <button
            type="button"
            className={cn(
              'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:text-foreground',
              groupByProject && 'bg-accent text-foreground',
            )}
            onClick={() => onGroupByProjectChange(!groupByProject)}
            aria-pressed={groupByProject}
            aria-label={groupLabel}
            title={groupLabel}
          >
            <ListTree className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div className="nav-divider" />
    </div>
  );
}
