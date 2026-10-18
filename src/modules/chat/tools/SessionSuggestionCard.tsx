import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Sparkles } from 'lucide-react';

import {
  readSuggestionState,
  startSuggestedSession,
  writeSuggestionState,
} from '@/modules/chat/utils/sessionSuggestions';
import type { SessionSuggestion, SessionSuggestionState } from '@/modules/chat/utils/sessionSuggestions';
import type { Project } from '@/shared/types';
import { Button } from '@/shared/ui';

type SessionSuggestionCardProps = {
  suggestion: SessionSuggestion;
  toolId?: string;
  project?: Project | null;
};

/**
 * Rendered by chat's MessageComponent in place of a suggest_session tool row:
 * the agent's out-of-scope finding as a dashed card. "Start session" opens a
 * new session in the project with the suggestion's prompt as its first message.
 */
function SessionSuggestionCard({ suggestion, toolId, project }: SessionSuggestionCardProps) {
  const { t } = useTranslation('chat');
  // What the user decided, mirrored from localStorage so history shows it too.
  const [state, setState] = useState<SessionSuggestionState | null>(() => readSuggestionState(toolId));

  const decide = useCallback((next: SessionSuggestionState) => {
    writeSuggestionState(toolId, next);
    setState(next);
  }, [toolId]);

  const handleStart = useCallback(() => {
    if (!project) {
      return;
    }
    decide('started');
    startSuggestedSession(project, suggestion.prompt);
  }, [decide, project, suggestion.prompt]);

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border border-dashed border-border px-3 py-3 sm:flex-row sm:items-center ${state === 'dismissed' ? 'opacity-60' : ''}`}
      data-testid="session-suggestion"
    >
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{suggestion.title}</p>
          {suggestion.summary && <p className="mt-0.5 text-xs text-muted-foreground">{suggestion.summary}</p>}
        </div>
      </div>
      {state === 'started' ? (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5" />
          {t('sessionSuggestion.started', { defaultValue: 'Session started' })}
        </span>
      ) : state === 'dismissed' ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {t('sessionSuggestion.dismissed', { defaultValue: 'Dismissed' })}
        </span>
      ) : (
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" onClick={() => decide('dismissed')}>
            {t('sessionSuggestion.dismiss', { defaultValue: 'Dismiss' })}
          </Button>
          <Button variant="outline" size="sm" onClick={handleStart} disabled={!project}>
            {t('sessionSuggestion.start', { defaultValue: 'Start session' })}
          </Button>
        </div>
      )}
    </div>
  );
}

export default memo(SessionSuggestionCard);
