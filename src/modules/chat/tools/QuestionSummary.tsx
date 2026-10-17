import React from 'react';
import { useTranslation } from 'react-i18next';

import type { Question } from '@/shared/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui';
import { useCollapsible } from '@/shared/ui/Collapsible';
import { useIsExportingTranscript } from '@/modules/chat/context/TranscriptRenderContext';
import { useIsVerboseTranscript } from '@/modules/chat/context/TranscriptViewModeContext';
import { QuestionAnswerContent } from '@/modules/chat/tools/ContentRenderers/QuestionAnswerContent';
import { readQuestions } from '@/modules/chat/utils/questionAnswers';

type QuestionSummaryProps = {
  questions: Question[];
  answers: Record<string, string>;
};

/** The full card, mounted only while open: the summary row is all most rows ever show. */
function QuestionDetails({ questions, answers }: QuestionSummaryProps) {
  const { open } = useCollapsible();
  return open ? <QuestionAnswerContent questions={questions} answers={answers} className="mt-1.5" /> : null;
}

/**
 * Rendered by chat's ToolRenderer for an answered AskUserQuestion: a compact
 * "Questions" row listing each question's short header and the answer given,
 * which expands to the full card with every option.
 */
export const QuestionSummary: React.FC<QuestionSummaryProps> = ({ questions, answers }) => {
  const { t } = useTranslation('chat');
  const isExporting = useIsExportingTranscript();
  const isVerbose = useIsVerboseTranscript();
  const validQuestions = readQuestions(questions);

  return (
    <div className="my-1 border-l-2 border-l-blue-500 py-0.5 pl-3 dark:border-l-blue-400">
      <Collapsible key={isVerbose ? 'verbose' : 'compact'} defaultOpen={isExporting || isVerbose} className="group/questions">
        <CollapsibleTrigger className="flex w-full items-center gap-1.5 py-0.5 text-left text-xs text-muted-foreground hover:text-foreground">
          <svg
            className="h-3 w-3 flex-shrink-0 transition-transform duration-150 group-data-[state=open]/questions:rotate-90"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-medium">{t('questions.title', { defaultValue: 'Questions' })}</span>
        </CollapsibleTrigger>
        <ul className="ml-[18px] mt-0.5 space-y-0.5 text-xs group-data-[state=open]/questions:hidden">
          {validQuestions.map((question) => {
            const answer = answers?.[question.question];
            return (
              <li key={question.question} className="flex min-w-0 gap-1.5">
                <span className="max-w-[45%] flex-shrink-0 truncate text-muted-foreground" title={question.question}>
                  {question.header || question.question}
                </span>
                {answer ? (
                  <span className="min-w-0 truncate font-medium text-foreground" title={answer}>{answer}</span>
                ) : (
                  <span className="italic text-muted-foreground/70">{t('questions.skipped', { defaultValue: 'Skipped' })}</span>
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
