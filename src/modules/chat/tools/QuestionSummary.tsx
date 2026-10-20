import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Hand } from 'lucide-react';

import type { Question } from '@/shared/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui';
import { useCollapsible } from '@/shared/ui/Collapsible';
import { useIsExportingTranscript } from '@/modules/chat/context/TranscriptRenderContext';
import { useIsVerboseTranscript } from '@/modules/chat/context/TranscriptViewModeContext';
import { QuestionAnswerContent } from '@/modules/chat/tools/ContentRenderers/QuestionAnswerContent';
import { readQuestions } from '@/modules/chat/utils/questionAnswers';
import { splitRecommendedLabel } from '@/modules/chat/utils/interactivePrompts';
import type { QuestionCallState } from '@/modules/chat/utils/interactivePrompts';

type QuestionSummaryProps = {
  questions: Question[];
  answers: Record<string, string>;
};

/** The full card, mounted only while open: the summary row is all most rows ever show. */
function QuestionDetails({ questions, answers }: QuestionSummaryProps) {
  const { open } = useCollapsible();
  return open ? <QuestionAnswerContent questions={questions} answers={answers} className="mt-1.5" /> : null;
}

function Chevron() {
  return (
    <svg
      className="h-3 w-3 flex-shrink-0 transition-transform duration-150 group-data-[state=open]/questions:rotate-90"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

/** An answer as the user saw it on the card: without the "(Recommended)" mark. */
function displayAnswer(answer: string): string {
  return splitRecommendedLabel(answer).label;
}

/**
 * Rendered by chat's ToolRenderer for an answered AskUserQuestion: a compact
 * "Questions · N answers" card listing each question's short header and the
 * answer given, which expands to the full card with every option.
 */
export const QuestionSummary: React.FC<QuestionSummaryProps> = ({ questions, answers }) => {
  const { t } = useTranslation('chat');
  const isExporting = useIsExportingTranscript();
  const isVerbose = useIsVerboseTranscript();
  const validQuestions = readQuestions(questions);
  const answeredCount = validQuestions.filter((question) => answers?.[question.question]).length;

  return (
    <div className="my-1 rounded-xl border border-border bg-card px-[11px] py-[9px] text-[13px]" data-testid="question-summary">
      <Collapsible key={isVerbose ? 'verbose' : 'compact'} defaultOpen={isExporting || isVerbose} className="group/questions">
        <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground">
          <Check className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <span className="font-medium">
            {`${t('questions.title')} · ${t('questions.answers', { count: answeredCount })}`}
          </span>
          <span className="ml-auto"><Chevron /></span>
        </CollapsibleTrigger>
        <ul className="mt-1 space-y-0.5 group-data-[state=open]/questions:hidden">
          {validQuestions.map((question) => {
            const answer = answers?.[question.question];
            return (
              <li key={question.question} className="flex min-w-0 gap-1.5">
                <span className="max-w-[45%] flex-shrink-0 truncate text-muted-foreground" title={question.question}>
                  {question.header || question.question}
                </span>
                {answer ? (
                  <span className="min-w-0 truncate font-semibold text-foreground" title={answer}>{displayAnswer(answer)}</span>
                ) : (
                  <span className="italic text-muted-foreground/70">{t('questions.skipped')}</span>
                )}
              </li>
            );
          })}
        </ul>
        <CollapsibleContent>
          <QuestionDetails questions={validQuestions} answers={answers || {}} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

type QuestionStateRowProps = {
  questions: Question[];
  state: Exclude<QuestionCallState, 'answered'>;
};

/**
 * Rendered by chat's ToolRenderer for a question with no answers: a slim
 * "waiting" line while the card in the composer's place asks it (never a grey
 * tool row, never "skipped" while it is open), and once settled a "skipped" or
 * "cancelled" row that opens to the questions that went unanswered.
 */
export const QuestionStateRow: React.FC<QuestionStateRowProps> = ({ questions, state }) => {
  const { t } = useTranslation('chat');
  const validQuestions = readQuestions(questions);
  if (validQuestions.length === 0) {
    return null;
  }
  const title = validQuestions.length === 1 ? t('questions.question') : t('questions.title');
  const first = validQuestions[0];

  if (state === 'pending') {
    return (
      <div
        className="my-1 flex min-w-0 items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300"
        data-testid="question-state-pending"
      >
        <Hand className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
        <span className="flex-shrink-0 font-medium">{`${title} · ${t('questions.pending')}`}</span>
        <span className="min-w-0 truncate text-muted-foreground" title={first.question}>{first.header || first.question}</span>
      </div>
    );
  }

  const stateLabel = state === 'skipped' ? t('questions.skippedState') : t('questions.cancelled');
  return (
    <div className="my-1 py-0.5 text-xs" data-testid={`question-state-${state}`}>
      <Collapsible className="group/questions">
        <CollapsibleTrigger className="flex w-full min-w-0 items-center gap-1.5 text-left text-muted-foreground hover:text-foreground">
          <Chevron />
          <span className="flex-shrink-0 font-medium">{`${title} · ${stateLabel}`}</span>
          <span className="min-w-0 truncate group-data-[state=open]/questions:hidden" title={first.question}>
            {first.header || first.question}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <QuestionDetails questions={validQuestions} answers={{}} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
