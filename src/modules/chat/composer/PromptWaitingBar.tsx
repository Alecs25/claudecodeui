import { useTranslation } from 'react-i18next';
import { Hand } from 'lucide-react';

/**
 * Rendered by ChatInterface under the session title while a question or plan
 * waits for the user, so the wait reads at the top of the chat too.
 */
export default function PromptWaitingBar({ providerLabel }: { providerLabel: string }) {
  const { t } = useTranslation('chat');
  return (
    <div
      role="status"
      data-testid="prompt-waiting-bar"
      className="flex flex-shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-50 px-3 py-[7px] text-[12.5px] font-semibold text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
    >
      <Hand className="h-4 w-4 flex-shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{t('prompt.waiting', { provider: providerLabel })}</span>
    </div>
  );
}
