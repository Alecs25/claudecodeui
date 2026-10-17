import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Braces, Brain, Check, MessageSquareText, type LucideIcon } from 'lucide-react';

import { ActionMenu } from '@/shared/ui';
import { TRANSCRIPT_VIEW_MODES, type TranscriptViewMode } from '@/shared/uiPreferences';

type TranscriptViewModeMenuProps = {
  mode: TranscriptViewMode;
  onChange: (mode: TranscriptViewMode) => void;
};

const MODE_ICONS: Record<TranscriptViewMode, LucideIcon> = {
  normal: MessageSquareText,
  thinking: Brain,
  verbose: Braces,
};

const MODE_DEFAULT_LABELS: Record<TranscriptViewMode, string> = {
  normal: 'Normal',
  thinking: 'Thinking',
  verbose: 'Verbose',
};

const MODE_DEFAULT_DESCRIPTIONS: Record<TranscriptViewMode, string> = {
  normal: 'Tool summaries, no thinking',
  thinking: 'Also thinking blocks',
  verbose: 'Every tool call expanded with raw input',
};

/**
 * Rendered by chat's ChatMessagesPane header: picks how much of the agent's
 * work the transcript shows. Ctrl+O cycles the same modes from the keyboard.
 */
function TranscriptViewModeMenu({ mode, onChange }: TranscriptViewModeMenuProps) {
  const { t } = useTranslation('chat');
  const currentLabel = t(`viewMode.${mode}`, { defaultValue: MODE_DEFAULT_LABELS[mode] });
  const triggerLabel = `${t('viewMode.title', { defaultValue: 'View' })}: ${currentLabel} (Ctrl+O)`;

  return (
    <ActionMenu
      icon={MODE_ICONS[mode]}
      iconOnly
      label={triggerLabel}
      ariaLabel={triggerLabel}
      triggerClassName="h-8 w-8 rounded-lg border border-border/50 bg-background/95 text-muted-foreground backdrop-blur hover:bg-accent hover:text-foreground"
      menuClassName="w-[260px] rounded-xl p-1.5 shadow-xl"
      header={(
        <div className="mb-1 flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-xs font-medium text-foreground">{t('viewMode.title', { defaultValue: 'View' })}</p>
          <kbd className="rounded border border-border px-1 font-mono text-[10px] text-muted-foreground">Ctrl+O</kbd>
        </div>
      )}
      items={TRANSCRIPT_VIEW_MODES.map((option) => ({
        key: option,
        label: t(`viewMode.${option}`, { defaultValue: MODE_DEFAULT_LABELS[option] }),
        description: t(`viewMode.${option}Description`, { defaultValue: MODE_DEFAULT_DESCRIPTIONS[option] }),
        icon: option === mode ? Check : MODE_ICONS[option],
        onSelect: () => onChange(option),
      }))}
    />
  );
}

export default memo(TranscriptViewModeMenu);
