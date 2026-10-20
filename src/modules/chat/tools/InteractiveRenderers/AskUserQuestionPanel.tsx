import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronLeft, ChevronRight, CircleHelp } from 'lucide-react';

import type { PermissionPanelProps, Question } from '@/shared/types';
import { buildQuestionAnswers, splitRecommendedLabel } from '@/modules/chat/utils/interactivePrompts';
import type { QuestionDraft } from '@/modules/chat/utils/interactivePrompts';
import { readQuestions } from '@/modules/chat/utils/questionAnswers';
import { PromptCardButton, PromptCardFrame } from '@/modules/chat/tools/InteractiveRenderers/PromptCardFrame';

/** Number keys reach the first nine options; the rest are picked by tap or click. */
const MAX_NUMBER_KEY_OPTIONS = 9;

const EMPTY_DRAFT: QuestionDraft = { selections: new Map(), otherTexts: new Map() };

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/** A key that types a character, as opposed to a shortcut or a navigation key. */
function isTypingKey(event: KeyboardEvent): boolean {
  return event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey;
}

function withSelection(draft: QuestionDraft, step: number, label: string, multiSelect: boolean): QuestionDraft {
  const selections = new Map(draft.selections);
  const current = new Set(selections.get(step) ?? []);
  const otherTexts = new Map(draft.otherTexts);
  if (multiSelect) {
    if (current.has(label)) current.delete(label);
    else current.add(label);
  } else {
    current.clear();
    current.add(label);
    // One answer per single-choice question: picking an option drops the typed one.
    otherTexts.delete(step);
  }
  selections.set(step, current);
  return { selections, otherTexts };
}

function withOtherText(draft: QuestionDraft, step: number, text: string, multiSelect: boolean): QuestionDraft {
  const otherTexts = new Map(draft.otherTexts);
  otherTexts.set(step, text);
  if (multiSelect || !text.trim()) {
    return { selections: draft.selections, otherTexts };
  }
  const selections = new Map(draft.selections);
  selections.set(step, new Set());
  return { selections, otherTexts };
}

/**
 * Registered by chat's PermissionRequestsBanner as the panel for
 * AskUserQuestion: drawn in the composer's place, one question at a time,
 * with large options, a free-text "Other", and keys 1-9 / Enter / Esc.
 */
export const AskUserQuestionPanel: React.FC<PermissionPanelProps> = ({
  request,
  onDecision,
  textAnswerRef,
}) => {
  const { t } = useTranslation('chat');
  const input = request.input as Record<string, unknown> | undefined;
  const questions: Question[] = readQuestions(input?.questions);

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<QuestionDraft>(EMPTY_DRAFT);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);
  // The composer hands text in after this render, so it reads the latest state here.
  const latestRef = useRef({ step, draft });
  useEffect(() => {
    latestRef.current = { step, draft };
  });

  const total = questions.length;
  const isLast = step >= total - 1;

  const goToStep = useCallback((nextStep: number) => {
    setStep(nextStep);
    setPreviewIndex(null);
  }, []);

  useEffect(() => {
    if (!isTextField(document.activeElement)) {
      frameRef.current?.focus({ preventScroll: true });
    }
  }, [step]);

  const submit = useCallback((answerDraft: QuestionDraft) => {
    onDecision(request.requestId, {
      allow: true,
      updatedInput: { ...(input ?? {}), answers: buildQuestionAnswers(questions, answerDraft) },
    });
  }, [input, onDecision, questions, request.requestId]);

  // An empty answer set: the model reads it as "the user chose not to answer".
  const skip = useCallback(() => {
    onDecision(request.requestId, { allow: true, updatedInput: { ...(input ?? {}), answers: {} } });
  }, [input, onDecision, request.requestId]);

  const advance = useCallback((fromStep: number, answerDraft: QuestionDraft) => {
    if (fromStep >= total - 1) {
      submit(answerDraft);
      return;
    }
    goToStep(fromStep + 1);
  }, [goToStep, submit, total]);

  const answerWithText = useCallback((text: string) => {
    const { step: currentStep, draft: currentDraft } = latestRef.current;
    const question = questions[currentStep];
    if (!question || !text.trim()) {
      return false;
    }
    const nextDraft = withOtherText(currentDraft, currentStep, text.trim(), Boolean(question.multiSelect));
    setDraft(nextDraft);
    advance(currentStep, nextDraft);
    return true;
  }, [advance, questions]);

  useEffect(() => {
    if (!textAnswerRef) {
      return undefined;
    }
    textAnswerRef.current = answerWithText;
    return () => {
      if (textAnswerRef.current === answerWithText) {
        textAnswerRef.current = null;
      }
    };
  }, [answerWithText, textAnswerRef]);

  if (total === 0) {
    return null;
  }

  const question = questions[Math.min(step, total - 1)];
  const options = Array.isArray(question.options) ? question.options : [];
  const multiSelect = Boolean(question.multiSelect);
  const selected = draft.selections.get(step) ?? new Set<string>();
  const otherText = draft.otherTexts.get(step) ?? '';
  const hasAnyAnswer = Object.keys(buildQuestionAnswers(questions, draft)).length > 0;

  const pick = (index: number) => {
    setDraft((previous) => withSelection(previous, step, options[index].label, multiSelect));
    setPreviewIndex(index);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isTextField(event.target)) {
      return;
    }
    const number = Number(event.key);
    if (Number.isInteger(number) && number >= 1 && number <= Math.min(options.length, MAX_NUMBER_KEY_OPTIONS)) {
      event.preventDefault();
      pick(number - 1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      advance(step, draft);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      skip();
      return;
    }
    // Typing anywhere on the card writes the "Other" answer.
    if (isTypingKey(event)) {
      otherInputRef.current?.focus();
    }
  };

  const shownPreviewIndex = previewIndex ?? options.findIndex((option) => selected.has(option.label));
  const preview = shownPreviewIndex >= 0 ? options[shownPreviewIndex]?.preview : undefined;
  const progressParts = [
    total > 1 ? t('prompt.progress', { current: step + 1, total }) : null,
    multiSelect ? t('prompt.multiSelect') : null,
  ].filter(Boolean);

  return (
    <PromptCardFrame
      ref={frameRef}
      label={t('prompt.question')}
      icon={<CircleHelp className="h-[18px] w-[18px]" aria-hidden />}
      chip={question.header}
      progress={progressParts.join(' · ') || undefined}
      onKeyDown={handleKeyDown}
      actions={(
        <>
          <PromptCardButton onClick={skip}>{t('prompt.skip')}</PromptCardButton>
          {step > 0 && (
            <PromptCardButton onClick={() => goToStep(step - 1)}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
              {t('prompt.back')}
            </PromptCardButton>
          )}
          <PromptCardButton
            variant="primary"
            onClick={() => advance(step, draft)}
            disabled={isLast && !hasAnyAnswer}
          >
            {isLast ? (total > 1 ? t('prompt.submitAll') : t('prompt.submit')) : t('prompt.next')}
            {!isLast && <ChevronRight className="h-4 w-4" aria-hidden />}
          </PromptCardButton>
        </>
      )}
    >
      <p className="mb-2.5 break-words text-[15px] font-semibold leading-snug" data-testid="prompt-card-question">
        {question.question}
      </p>

      <div
        role={multiSelect ? 'group' : 'radiogroup'}
        aria-label={question.question}
        className="max-h-[min(45vh,22rem)] space-y-[7px] overflow-y-auto overscroll-contain"
      >
        {options.map((option, index) => {
          const isSelected = selected.has(option.label);
          const { label, recommended } = splitRecommendedLabel(option.label);
          return (
            <button
              key={option.label}
              type="button"
              role={multiSelect ? 'checkbox' : 'radio'}
              aria-checked={isSelected}
              onClick={() => pick(index)}
              onFocus={() => setPreviewIndex(index)}
              onMouseEnter={() => {
                if (option.preview) setPreviewIndex(index);
              }}
              className={`flex min-h-12 w-full items-start gap-2.5 rounded-xl border px-[11px] py-2.5 text-left transition-colors ${
                isSelected
                  ? 'border-orange-500 bg-orange-50 dark:border-orange-400 dark:bg-orange-900/25'
                  : 'border-border hover:bg-muted/60'
              }`}
            >
              <span
                aria-hidden
                className={`mt-px grid h-[22px] w-[22px] flex-shrink-0 place-items-center rounded-md text-xs font-bold ${
                  isSelected ? 'bg-orange-600 text-white dark:bg-orange-500' : 'bg-muted text-muted-foreground'
                }`}
              >
                {multiSelect && isSelected
                  ? <Check className="h-3 w-3" />
                  : index < MAX_NUMBER_KEY_OPTIONS ? index + 1 : ''}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-semibold leading-snug">
                  {label}
                  {recommended && (
                    <span className="ml-1 text-xs font-medium text-orange-600 dark:text-orange-400" data-testid="prompt-option-recommended">
                      {`· ${t('prompt.recommended')}`}
                    </span>
                  )}
                </span>
                {option.description && (
                  <span className="mt-0.5 block break-words text-[12.5px] leading-snug text-muted-foreground">
                    {option.description}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {preview && (
        <div className="mt-2" data-testid="prompt-option-preview">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{t('prompt.preview')}</div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-2 font-mono text-xs">
            {preview}
          </pre>
        </div>
      )}

      <input
        ref={otherInputRef}
        type="text"
        value={otherText}
        onChange={(event) => setDraft((previous) => withOtherText(previous, step, event.target.value, multiSelect))}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            advance(step, draft);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            frameRef.current?.focus({ preventScroll: true });
          }
        }}
        aria-label={t('prompt.other')}
        placeholder={t('prompt.otherPlaceholder')}
        enterKeyHint={isLast ? 'send' : 'next'}
        className={`mt-[7px] h-11 w-full rounded-xl border border-dashed bg-transparent px-[11px] text-sm outline-none placeholder:text-muted-foreground/70 focus:border-solid focus:border-orange-500 ${
          otherText.trim() ? 'border-solid border-orange-500 bg-orange-50/60 dark:border-orange-400 dark:bg-orange-900/20' : 'border-border'
        }`}
      />
    </PromptCardFrame>
  );
};
