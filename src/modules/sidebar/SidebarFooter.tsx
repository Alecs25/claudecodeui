import { AlertTriangle, ArrowUpCircle, Settings, SlidersHorizontal } from 'lucide-react';
import type { TFunction } from 'i18next';

import type { ReleaseInfo, SettingsOpenTarget } from '@/shared/types';

// Agents → MCP servers: where connectors and skills are configured; plugins sit next to it.
const CUSTOMIZE_SETTINGS_TAB: SettingsOpenTarget = 'agents:mcp';

type SidebarFooterProps = {
  updateAvailable: boolean;
  restartRequired: boolean;
  releaseInfo: ReleaseInfo | null;
  latestVersion: string | null;
  currentVersion: string;
  onShowVersionModal: () => void;
  onShowSettings: (tab?: SettingsOpenTarget) => void;
  t: TFunction;
};

/** Rendered by SidebarContent at the bottom of the panel: update status, "Customize" and "Settings" with the version. */
export default function SidebarFooter({
  updateAvailable,
  restartRequired,
  releaseInfo,
  latestVersion,
  currentVersion,
  onShowVersionModal,
  onShowSettings,
  t,
}: SidebarFooterProps) {
  const rowClassName =
    'flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground';

  return (
    <div className="flex-shrink-0 border-t border-border/60 px-2 py-1.5" style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom, 0px))' }}>
      {/* The running server differs from the installed/frontend version
          (updated but not restarted). */}
      {restartRequired && (
        <div className="mb-1 flex items-center gap-2.5 rounded-lg border border-amber-300/60 bg-amber-50/80 px-2.5 py-2 dark:border-amber-700/40 dark:bg-amber-900/15">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-500 dark:text-amber-400" />
          <span className="min-w-0 flex-1 text-xs font-medium text-amber-700 dark:text-amber-300">
            {t('version.restartRequired')}
          </span>
        </div>
      )}

      {updateAvailable && (
        <button
          type="button"
          className="mb-1 flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-blue-50/80 dark:hover:bg-blue-900/15"
          onClick={onShowVersionModal}
        >
          <span className="relative flex-shrink-0">
            <ArrowUpCircle className="h-4 w-4 text-blue-500 dark:text-blue-400" />
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-blue-600 dark:text-blue-300">
              {releaseInfo?.title || `v${latestVersion}`}
            </span>
            <span className="block text-[11px] text-blue-500/70 dark:text-blue-400/60">
              {t('version.updateAvailable')}
            </span>
          </span>
        </button>
      )}

      <button type="button" className={rowClassName} onClick={() => onShowSettings(CUSTOMIZE_SETTINGS_TAB)}>
        <SlidersHorizontal className="h-4 w-4 flex-shrink-0" />
        <span>{t('actions.customize', { defaultValue: 'Customize' })}</span>
      </button>
      <button type="button" className={rowClassName} onClick={() => onShowSettings()}>
        <Settings className="h-4 w-4 flex-shrink-0" />
        <span>{t('actions.settings')}</span>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground/60">v{currentVersion}</span>
      </button>
    </div>
  );
}
