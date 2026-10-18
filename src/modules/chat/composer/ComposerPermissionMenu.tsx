import { memo, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Bot,
  ClipboardList,
  Hand,
  ShieldQuestion,
  Smile,
  type LucideIcon,
} from 'lucide-react';

import type { PermissionMode } from '@/shared/types';
import { useComposerMenuAnchor } from '@/modules/chat/hooks/useComposerMenuAnchor';
import {
  ComposerMenuHeading,
  ComposerMenuItem,
  ComposerMenuSurface,
} from '@/modules/chat/composer/ComposerMenuPrimitives';

type ModeAppearance = {
  icon: LucideIcon;
  trigger: string;
  item: string;
};

/**
 * Presentation only. Which modes exist for a provider comes from the backend
 * capability matrix, so an unknown mode still renders through UNKNOWN_MODE.
 */
const MODE_APPEARANCE: Record<PermissionMode, ModeAppearance> = {
  default: {
    icon: Hand,
    trigger: 'border-border/60 bg-muted/50 text-muted-foreground hover:bg-muted',
    item: 'text-foreground',
  },
  auto: {
    icon: Bot,
    trigger:
      'border-blue-300/60 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-600/40 dark:bg-blue-900/15 dark:text-blue-300 dark:hover:bg-blue-900/25',
    item: 'text-blue-700 dark:text-blue-300',
  },
  acceptEdits: {
    icon: Smile,
    trigger:
      'border-green-300/60 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-600/40 dark:bg-green-900/15 dark:text-green-300 dark:hover:bg-green-900/25',
    item: 'text-green-700 dark:text-green-300',
  },
  bypassPermissions: {
    icon: AlertTriangle,
    trigger:
      'border-orange-300/60 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-600/40 dark:bg-orange-900/15 dark:text-orange-300 dark:hover:bg-orange-900/25',
    item: 'text-orange-600 dark:text-orange-400',
  },
  plan: {
    icon: ClipboardList,
    trigger: 'border-primary/20 bg-primary/5 text-primary hover:bg-primary/10',
    item: 'text-primary',
  },
};

const UNKNOWN_MODE: ModeAppearance = {
  icon: ShieldQuestion,
  trigger: 'border-border/60 bg-muted/50 text-muted-foreground hover:bg-muted',
  item: 'text-foreground',
};

const getAppearance = (mode: PermissionMode | string): ModeAppearance =>
  MODE_APPEARANCE[mode as PermissionMode] ?? UNKNOWN_MODE;

/**
 * The pill's own words, shorter than the menu's: the full one on wider
 * screens, the short one on a phone, where the whole bar has to fit 360px.
 */
const PILL_LABELS: Record<PermissionMode, { short: string; full: string }> = {
  default: { short: 'Ask', full: 'Ask permissions' },
  auto: { short: 'Auto', full: 'Auto mode' },
  acceptEdits: { short: 'Edits', full: 'Accept edits' },
  bypassPermissions: { short: 'Bypass', full: 'Bypass permissions' },
  plan: { short: 'Plan', full: 'Plan mode' },
};

type ComposerPermissionMenuProps = {
  permissionMode: PermissionMode;
  /** Modes the active provider supports, in the order the backend reports them. */
  permissionModes: PermissionMode[];
  onSelectPermissionMode: (mode: PermissionMode) => void;
  providerLabel: string;
};

/**
 * Rendered by chat's ChatComposer as the popover for choosing the permission
 * mode the active provider runs the next turn under.
 */
function ComposerPermissionMenu({
  permissionMode,
  permissionModes,
  onSelectPermissionMode,
  providerLabel,
}: ComposerPermissionMenuProps) {
  const { t } = useTranslation('chat');
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);
  // Left-aligned: the pill sits near the start of the bar.
  const { triggerRef, menuRef, anchor, updateAnchor } = useComposerMenuAnchor(isOpen, close, 22 * 16, 'left');

  if (permissionModes.length === 0) {
    return null;
  }

  const activeAppearance = getAppearance(permissionMode);
  const ActiveIcon = activeAppearance.icon;
  const heading = t('composer.permissionHeading', {
    provider: providerLabel,
    defaultValue: 'How should {{provider}} actions be approved?',
  });
  const pillDefaults = PILL_LABELS[permissionMode] ?? { short: permissionMode, full: permissionMode };
  const shortLabel = t(`composer.permissionPill.short.${permissionMode}`, { defaultValue: pillDefaults.short });
  const fullLabel = t(`composer.permissionPill.full.${permissionMode}`, { defaultValue: pillDefaults.full });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          updateAnchor();
          setIsOpen((current) => !current);
        }}
        className={`flex h-8 min-w-0 max-w-[7.5rem] shrink items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors sm:max-w-52 ${activeAppearance.trigger}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={heading}
        title={t('input.clickToChangeMode')}
      >
        <ActiveIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate sm:hidden">{shortLabel}</span>
        <span className="hidden truncate sm:inline">{fullLabel}</span>
      </button>

      {isOpen && anchor && createPortal(
        <ComposerMenuSurface anchor={anchor} menuRef={menuRef} ariaLabel={heading}>
          <ComposerMenuHeading>{heading}</ComposerMenuHeading>
          {permissionModes.map((mode) => {
            const appearance = getAppearance(mode);
            const ModeIcon = appearance.icon;
            return (
              <ComposerMenuItem
                key={mode}
                icon={<ModeIcon className="h-4 w-4" />}
                label={t(`codex.modes.${mode}`, { defaultValue: mode })}
                description={t(`codex.descriptions.${mode}`, { defaultValue: '' }) || undefined}
                isSelected={mode === permissionMode}
                onSelect={() => {
                  onSelectPermissionMode(mode);
                  setIsOpen(false);
                }}
                className={appearance.item}
              />
            );
          })}
        </ComposerMenuSurface>,
        document.body,
      )}
    </>
  );
}

/** Memoized: the composer re-renders on every keystroke and none of this menu's props change while typing. */
export default memo(ComposerPermissionMenu);
