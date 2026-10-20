import type { PendingPermissionRequest, Question } from '@/shared/types';
import { usePermission } from '@/modules/chat/context/PermissionContext';
import { useTranscriptRunActive } from '@/modules/chat/context/TranscriptSessionContext';
import { QuestionStateRow, QuestionSummary } from '@/modules/chat/tools/QuestionSummary';
import { isQuestionTool, readQuestionCallState } from '@/modules/chat/utils/interactivePrompts';
import { hasQuestionAnswers, readQuestions } from '@/modules/chat/utils/questionAnswers';

type QuestionCallProps = {
  questions: unknown;
  answers: unknown;
  toolResult?: { isError?: boolean } | null;
};

/** Whether one of the open prompts asks these questions: requests carry no tool-use id, so the text is the link. */
function isQuestionPromptOpen(requests: PendingPermissionRequest[], questions: Question[]): boolean {
  const firstQuestion = questions[0]?.question;
  return requests.some((request) => {
    if (!isQuestionTool(request.toolName)) {
      return false;
    }
    const asked = readQuestions((request.input as { questions?: unknown } | undefined)?.questions);
    return !firstQuestion || asked[0]?.question === firstQuestion;
  });
}

/**
 * Rendered by chat's ToolRenderer for an AskUserQuestion call. Its own
 * component so only question rows follow the open prompts and the run state,
 * not every tool row in the transcript.
 */
export function QuestionCall({ questions, answers, toolResult }: QuestionCallProps) {
  const pendingPermissionRequests = usePermission()?.pendingPermissionRequests;
  const isRunActive = useTranscriptRunActive();
  const validQuestions = readQuestions(questions);
  const state = readQuestionCallState({
    hasAnswers: hasQuestionAnswers(validQuestions, answers),
    toolResult,
    isPromptOpen: isQuestionPromptOpen(pendingPermissionRequests ?? [], validQuestions),
    isRunActive,
  });

  if (state === 'answered') {
    return <QuestionSummary questions={validQuestions} answers={answers as Record<string, string>} />;
  }
  return <QuestionStateRow questions={validQuestions} state={state} />;
}
