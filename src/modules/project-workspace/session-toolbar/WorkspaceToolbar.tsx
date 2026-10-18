import { MoreVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ActionMenu, Tooltip, type ActionMenuItem } from '@/shared/ui';
import type { AppTab } from '@/shared/types';
import { cn } from '@/shared/utils';
import { usePlugins } from '@/modules/plugins';
import { PANE_DEFINITIONS, type BuiltInPaneId } from '@/modules/project-workspace/session-toolbar/paneDefinitions';
import type { GitChangeSummary } from '@/modules/project-workspace/hooks/useGitChangeSummary';

type WorkspaceToolbarProps = {
  activeTab: AppTab;
  /** Opens a pane, or closes it when it is the one already open. */
  onTogglePane: (pane: AppTab) => void;
  changes: GitChangeSummary | null;
  shouldShowTasksTab: boolean;
  shouldShowBrowserTab: boolean;
  isMobile: boolean;
};

const BUTTON_CLASS = 'flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';
const ACTIVE_CLASS = 'bg-accent text-foreground';

/**
 * Rendered by WorkspaceHeader on the right of the title: Terminal, the
 * "+N −M" chip that opens Changes, Preview, and ⋮ with the other panes.
 * Below 768px only the chip and ⋮ stay; ⋮ then lists Terminal and Preview too.
 */
export default function WorkspaceToolbar({
  activeTab,
  onTogglePane,
  changes,
  shouldShowTasksTab,
  shouldShowBrowserTab,
  isMobile,
}: WorkspaceToolbarProps) {
  const { t } = useTranslation();
  const { plugins } = usePlugins();
  const label = (pane: BuiltInPaneId) => t(PANE_DEFINITIONS[pane].labelKey, { defaultValue: PANE_DEFINITIONS[pane].defaultLabel });

  const renderPaneButton = (pane: BuiltInPaneId) => {
    const { icon: Icon } = PANE_DEFINITIONS[pane];
    const isActive = activeTab === pane;
    return (
      <Tooltip content={label(pane)} position="bottom">
        <button
          type="button"
          aria-pressed={isActive}
          aria-label={label(pane)}
          onClick={() => onTogglePane(pane)}
          className={cn(BUTTON_CLASS, isActive && ACTIVE_CLASS)}
        >
          <Icon className="h-4 w-4 flex-shrink-0" />
          {/* Labels only when the header leaves the session title room beside them, whatever the screen width. */}
          <span className="hidden cq-wide:inline">{label(pane)}</span>
        </button>
      </Tooltip>
    );
  };

  const menuPanes: BuiltInPaneId[] = [
    ...(isMobile ? (['shell'] as BuiltInPaneId[]) : []),
    ...(isMobile && shouldShowBrowserTab ? (['browser'] as BuiltInPaneId[]) : []),
    'files',
    'git',
    ...(shouldShowTasksTab ? (['tasks'] as BuiltInPaneId[]) : []),
    'background',
  ];
  const menuItems: ActionMenuItem[] = [
    ...menuPanes.map((pane) => ({
      key: pane,
      label: label(pane),
      icon: PANE_DEFINITIONS[pane].icon,
      onSelect: () => onTogglePane(pane),
    })),
    ...plugins.filter((plugin) => plugin.enabled).map((plugin, index) => ({
      key: `plugin:${plugin.name}`,
      label: plugin.displayName,
      showDividerBefore: index === 0,
      onSelect: () => onTogglePane(`plugin:${plugin.name}` as AppTab),
    })),
  ];

  const isChangesActive = activeTab === 'diff';
  const changesLabel = t(PANE_DEFINITIONS.diff.labelKey, { defaultValue: PANE_DEFINITIONS.diff.defaultLabel });

  return (
    <div className="flex flex-shrink-0 items-center gap-0.5">
      {!isMobile && renderPaneButton('shell')}
      {changes && (
        <Tooltip content={changesLabel} position="bottom">
          <button
            type="button"
            aria-pressed={isChangesActive}
            aria-label={`${changesLabel}: +${changes.added} −${changes.deleted}`}
            onClick={() => onTogglePane('diff')}
            className={cn(BUTTON_CLASS, 'font-mono text-xs tabular-nums', isChangesActive && ACTIVE_CLASS)}
          >
            <span className={changes.added > 0 ? 'text-green-600 dark:text-green-400' : undefined}>+{changes.added}</span>
            <span className={changes.deleted > 0 ? 'text-red-600 dark:text-red-400' : undefined}>−{changes.deleted}</span>
          </button>
        </Tooltip>
      )}
      {!isMobile && shouldShowBrowserTab && renderPaneButton('browser')}
      <ActionMenu
        icon={MoreVertical}
        iconOnly
        label={t('panes.more', { defaultValue: 'More' })}
        variant="ghost"
        portal
        items={menuItems}
        triggerClassName={cn(BUTTON_CLASS, 'w-9 px-0')}
      />
    </div>
  );
}
