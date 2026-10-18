import {
  Braces,
  Brain,
  Languages,
  Lightbulb,
  MessageSquareText,
  Mic,
  Moon,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { DarkModeToggle, Pill, PillBar } from '@/shared/ui';
import { TRANSCRIPT_VIEW_MODES, type TranscriptViewMode } from '@/shared/uiPreferences';
import { LanguageSelector } from '@/modules/i18n';
import { SETTING_ROW_CLASS } from '@/shared/constants';
import type { PreferenceToggleKey, QuickSettingsPreferences } from '@/shared/types';
import QuickSettingsSection from '@/modules/quick-settings-panel/QuickSettingsSection';
import QuickSettingsToggleRow from '@/modules/quick-settings-panel/QuickSettingsToggleRow';

/** Declarative description of one quick settings toggle row - its preference key, translation key and icon - so the rows can be rendered from a list instead of hand-written. */
type PreferenceToggleItem = {
  key: PreferenceToggleKey;
  labelKey: string;
  icon: LucideIcon;
};

// The two old toggles (show thinking, show raw parameters) are one choice now,
// the same Normal / Thinking / Verbose the chat header and Ctrl+O cycle.
const TRANSCRIPT_VIEW_MODE_ICONS: Record<TranscriptViewMode, LucideIcon> = {
  normal: MessageSquareText,
  thinking: Brain,
  verbose: Braces,
};

const TRANSCRIPT_VIEW_MODE_DEFAULT_LABELS: Record<TranscriptViewMode, string> = {
  normal: 'Normal',
  thinking: 'Thinking',
  verbose: 'Verbose',
};

const INPUT_SETTING_TOGGLES: PreferenceToggleItem[] = [
  {
    key: 'sendByCtrlEnter',
    labelKey: 'quickSettings.sendByCtrlEnter',
    icon: Languages,
  },
  {
    key: 'voiceEnabled',
    labelKey: 'quickSettings.voiceEnabled',
    icon: Mic,
  },
  {
    key: 'promptSuggestions',
    labelKey: 'quickSettings.promptSuggestions',
    icon: Lightbulb,
  },
];

type QuickSettingsContentProps = {
  isDarkMode: boolean;
  preferences: QuickSettingsPreferences;
  onPreferenceChange: (key: PreferenceToggleKey, value: boolean) => void;
  transcriptViewMode: TranscriptViewMode;
  onTranscriptViewModeChange: (mode: TranscriptViewMode) => void;
};

/** Rendered by QuickSettingsPanelView to show the drawer's appearance, tool display and input preference rows. */
export default function QuickSettingsContent({
  isDarkMode,
  preferences,
  onPreferenceChange,
  transcriptViewMode,
  onTranscriptViewModeChange,
}: QuickSettingsContentProps) {
  const { t } = useTranslation('settings');
  const inputSettingToggles = preferences.voiceEnabled
    ? INPUT_SETTING_TOGGLES
    : INPUT_SETTING_TOGGLES.filter(({ key }) => key !== 'voiceEnabled');

  const renderToggleRows = (items: PreferenceToggleItem[]) => (
    items.map(({ key, labelKey, icon }) => (
      <QuickSettingsToggleRow
        key={key}
        label={t(labelKey)}
        icon={icon}
        checked={preferences[key]}
        onCheckedChange={(value) => onPreferenceChange(key, value)}
      />
    ))
  );

  return (
    <div className="flex-1 space-y-6 overflow-y-auto overflow-x-hidden bg-background p-4">
      <QuickSettingsSection title={t('quickSettings.sections.appearance')}>
        <div className={SETTING_ROW_CLASS}>
          <span className="flex items-center gap-2 text-sm text-foreground">
            {isDarkMode ? (
              <Moon className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Sun className="h-4 w-4 text-muted-foreground" />
            )}
            {t('quickSettings.darkMode')}
          </span>
          <DarkModeToggle />
        </div>
        <LanguageSelector compact />
      </QuickSettingsSection>

      <QuickSettingsSection title={t('quickSettings.sections.toolDisplay')}>
        <PillBar role="radiogroup" aria-label={t('quickSettings.transcriptView', { defaultValue: 'Transcript view' })} className="w-full">
          {TRANSCRIPT_VIEW_MODES.map((mode) => {
            const Icon = TRANSCRIPT_VIEW_MODE_ICONS[mode];
            return (
              <Pill
                key={mode}
                role="radio"
                aria-checked={transcriptViewMode === mode}
                isActive={transcriptViewMode === mode}
                onClick={() => onTranscriptViewModeChange(mode)}
                className="flex-1 justify-center px-2 text-xs"
              >
                <Icon className="h-3.5 w-3.5" />
                {t(`quickSettings.transcriptViewModes.${mode}`, { defaultValue: TRANSCRIPT_VIEW_MODE_DEFAULT_LABELS[mode] })}
              </Pill>
            );
          })}
        </PillBar>
      </QuickSettingsSection>

      <QuickSettingsSection title={t('quickSettings.sections.inputSettings')}>
        {renderToggleRows(inputSettingToggles)}
        <p className="ml-3 text-xs text-muted-foreground">
          {t('quickSettings.sendByCtrlEnterDescription')}
        </p>
      </QuickSettingsSection>
    </div>
  );
}
