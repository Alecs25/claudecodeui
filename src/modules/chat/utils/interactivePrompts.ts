import type { PendingPermissionRequest, Question } from '@/shared/types';
import { orderPermissionRequests } from '@/modules/chat/utils/chatPermissions';

/** Tools that ask the user something (a question, a plan to approve) rather than for permission to act. */
const QUESTION_TOOLS = new Set(['AskUserQuestion']);
const PLAN_TOOLS = new Set(['ExitPlanMode', 'exit_plan_mode']);

export function isQuestionTool(toolName: unknown): boolean {
  return typeof toolName === 'string' && QUESTION_TOOLS.has(toolName);
}

export function isPlanTool(toolName: unknown): boolean {
  return typeof toolName === 'string' && PLAN_TOOLS.has(toolName);
}

/** A question or a plan approval: the prompts drawn as a card in place of the composer. */
export function isInteractivePromptTool(toolName: unknown): boolean {
  return isQuestionTool(toolName) || isPlanTool(toolName);
}

/**
 * The request the composer area shows now: the oldest one, as the banner
 * answers them in the order Claude asked. Null when nothing waits.
 */
export function readActivePrompt(requests: PendingPermissionRequest[]): PendingPermissionRequest | null {
  return orderPermissionRequests(requests)[0] ?? null;
}

/** True when the request on screen is a question or plan card, which replaces the composer. */
export function hasInteractivePromptCard(requests: PendingPermissionRequest[]): boolean {
  return isInteractivePromptTool(readActivePrompt(requests)?.toolName);
}

// Claude marks the option it suggests by appending this to the label.
const RECOMMENDED_SUFFIX = /\s*\((recommended|consigliat[ao])\)\s*$/i;

/** The label to show, and whether the model marked the option as the one it recommends. */
export function splitRecommendedLabel(label: string): { label: string; recommended: boolean } {
  if (!RECOMMENDED_SUFFIX.test(label)) {
    return { label, recommended: false };
  }
  return { label: label.replace(RECOMMENDED_SUFFIX, ''), recommended: true };
}

/** Per question index: the option labels picked and the free text typed under "Other". */
export type QuestionDraft = {
  selections: ReadonlyMap<number, ReadonlySet<string>>;
  otherTexts: ReadonlyMap<number, string>;
};

/**
 * The answers sent back to the tool, keyed by question text. Option labels go
 * back as the model wrote them (suffix included) so it recognises its own
 * options; the free text joins them. A question with nothing picked is left
 * out, which the model reads as not answered.
 */
export function buildQuestionAnswers(questions: Question[], draft: QuestionDraft): Record<string, string> {
  const answers: Record<string, string> = {};
  questions.forEach((question, index) => {
    const picked = Array.from(draft.selections.get(index) ?? []);
    const otherText = (draft.otherTexts.get(index) ?? '').trim();
    if (otherText) {
      picked.push(otherText);
    }
    if (picked.length > 0) {
      answers[question.question] = picked.join(', ');
    }
  });
  return answers;
}

/** How a question call ended up, as the transcript shows it. */
export type QuestionCallState = 'pending' | 'answered' | 'skipped' | 'cancelled';

/**
 * A call with answers was answered; one whose result carries none was skipped
 * (the card's "Skip" sends an empty answer set); an error result, or no result
 * once the run is over, means the run stopped before anyone answered. Without
 * a result the call is still waiting while the run lasts or its prompt is open.
 */
export function readQuestionCallState(input: {
  hasAnswers: boolean;
  toolResult: { isError?: boolean } | null | undefined;
  isPromptOpen: boolean;
  isRunActive: boolean;
}): QuestionCallState {
  if (input.hasAnswers) {
    return 'answered';
  }
  if (input.toolResult) {
    return input.toolResult.isError ? 'cancelled' : 'skipped';
  }
  return input.isPromptOpen || input.isRunActive ? 'pending' : 'cancelled';
}
