import type { Question } from '@/shared/types';

/** Only well-formed questions: the input comes from transcripts and may be malformed. */
export function readQuestions(questions: unknown): Question[] {
  return Array.isArray(questions)
    ? questions.filter((question): question is Question => Boolean(question) && typeof question?.question === 'string')
    : [];
}

/** True once the user has answered at least one question, which is when the compact summary replaces the full card. */
export function hasQuestionAnswers(questions: unknown, answers: unknown): boolean {
  if (!answers || typeof answers !== 'object') {
    return false;
  }
  const answerMap = answers as Record<string, unknown>;
  return readQuestions(questions).some((question) => typeof answerMap[question.question] === 'string' && answerMap[question.question]);
}
