import { createRef } from 'react';
import type { ComponentProps, MutableRefObject } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import '@/modules/i18n';
import ChatComposer from '@/modules/chat/composer/ChatComposer';
import { UiPreferencesProvider } from '@/shared/context/UiPreferencesContext';
import { AskUserQuestionPanel } from '@/modules/chat/tools/InteractiveRenderers/AskUserQuestionPanel';
import { PlanApprovalPanel } from '@/modules/chat/tools/InteractiveRenderers/PlanApprovalPanel';
import { splitRecommendedLabel } from '@/modules/chat/utils/interactivePrompts';
import type { PendingPermissionRequest, PromptTextAnswerHandler, Question } from '@/shared/types';

/**
 * While Claude waits on a question or a plan, a card takes the composer's
 * place: options picked by tap or keys 1-9, Enter to go on, Esc to skip, an
 * "Other" answer in words, and text sent from elsewhere becomes that answer.
 */

const SINGLE: Question[] = [{
  question: 'Proceed with #143 as described?',
  header: '#143',
  options: [
    { label: 'Yes, go ahead (Recommended)', description: 'Odoo and storefront on test' },
    { label: 'Only Odoo', description: 'Storefront later', preview: 'odoo-only diff' },
    { label: 'Wait' },
  ],
}];

const TWO: Question[] = [
  SINGLE[0],
  {
    question: 'What do Adobe orders need?',
    header: 'Adobe',
    multiSelect: true,
    options: [{ label: 'Admin email' }, { label: 'Keyless delivery' }, { label: 'Customer notice' }],
  },
];

const questionRequest = (questions: Question[]): PendingPermissionRequest => ({
  requestId: 'q1',
  toolName: 'AskUserQuestion',
  input: { questions },
});

function renderQuestion(questions: Question[], textAnswerRef?: MutableRefObject<PromptTextAnswerHandler | null>) {
  const onDecision = vi.fn();
  render(<AskUserQuestionPanel request={questionRequest(questions)} onDecision={onDecision} textAnswerRef={textAnswerRef} />);
  return onDecision;
}

type AnswerDecision = { updatedInput: { answers: Record<string, string> } };

const answersOf = (onDecision: ReturnType<typeof vi.fn>) => {
  const lastCall = onDecision.mock.calls[onDecision.mock.calls.length - 1];
  return (lastCall[1] as AnswerDecision).updatedInput.answers;
};

describe('the question card', () => {
  it('strips the recommendation mark from the label and shows it apart', () => {
    expect(splitRecommendedLabel('Yes (Recommended)')).toEqual({ label: 'Yes', recommended: true });
    expect(splitRecommendedLabel('Sì (Consigliata)')).toEqual({ label: 'Sì', recommended: true });
    expect(splitRecommendedLabel('Plain')).toEqual({ label: 'Plain', recommended: false });

    renderQuestion(SINGLE);
    expect(screen.getByRole('radio', { name: /Yes, go ahead/ }).textContent).not.toContain('(Recommended)');
    expect(screen.getByTestId('prompt-option-recommended').textContent).toContain('recommended');
    expect(screen.getByText('#143')).toBeTruthy();
  });

  it('picks with number keys and sends with Enter, keeping the label the model wrote', () => {
    const onDecision = renderQuestion(SINGLE);
    const card = screen.getByTestId('prompt-card');

    fireEvent.keyDown(card, { key: '1' });
    expect(screen.getByRole('radio', { name: /Yes, go ahead/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(onDecision).toHaveBeenCalledTimes(1);
    expect(onDecision.mock.calls[0][0]).toBe('q1');
    expect(answersOf(onDecision)).toEqual({ 'Proceed with #143 as described?': 'Yes, go ahead (Recommended)' });
  });

  it('shows the option preview when the option has focus', () => {
    renderQuestion(SINGLE);
    expect(screen.queryByTestId('prompt-option-preview')).toBeNull();
    fireEvent.focus(screen.getByRole('radio', { name: /Only Odoo/ }));
    expect(screen.getByTestId('prompt-option-preview').textContent).toContain('odoo-only diff');
  });

  it('walks several questions with progress, Back, and checkboxes for multiple choice', () => {
    const onDecision = renderQuestion(TWO);
    expect(screen.getByTestId('prompt-card-progress').textContent).toBe('1 of 2');

    fireEvent.click(screen.getByRole('radio', { name: /Only Odoo/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));

    expect(screen.getByTestId('prompt-card-progress').textContent).toBe('2 of 2 · multiple choice');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Admin email' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Keyless delivery' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Other' }), { target: { value: 'Invoice note' } });

    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByRole('radio', { name: /Only Odoo/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send answers' }));

    expect(answersOf(onDecision)).toEqual({
      'Proceed with #143 as described?': 'Only Odoo',
      'What do Adobe orders need?': 'Admin email, Keyless delivery, Invoice note',
    });
  });

  it('answers in words through "Other", which replaces a single choice', () => {
    const onDecision = renderQuestion(SINGLE);
    fireEvent.keyDown(screen.getByTestId('prompt-card'), { key: '2' });
    const other = screen.getByRole('textbox', { name: 'Other' });
    fireEvent.change(other, { target: { value: 'Only the storefront' } });
    expect(screen.getByRole('radio', { name: /Only Odoo/ }).getAttribute('aria-checked')).toBe('false');
    fireEvent.keyDown(other, { key: 'Enter' });

    expect(answersOf(onDecision)).toEqual({ 'Proceed with #143 as described?': 'Only the storefront' });
  });

  it('typing a letter on the card goes to the "Other" field', () => {
    renderQuestion(SINGLE);
    fireEvent.keyDown(screen.getByTestId('prompt-card'), { key: 'n' });
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Other' }));
  });

  it('skips only through Skip or Esc, with an empty answer set', () => {
    const onDecision = renderQuestion(SINGLE);
    expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(true);
    fireEvent.keyDown(screen.getByTestId('prompt-card'), { key: 'Escape' });
    expect(answersOf(onDecision)).toEqual({});

    onDecision.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(answersOf(onDecision)).toEqual({});
  });

  it('takes a message sent from the composer as the current question\'s "Other" answer', () => {
    const textAnswerRef = createRef<PromptTextAnswerHandler | null>() as MutableRefObject<PromptTextAnswerHandler | null>;
    const onDecision = renderQuestion(TWO, textAnswerRef);

    act(() => {
      expect(textAnswerRef.current?.('Ship Odoo first')).toBe(true);
    });
    // First of two: it answered and moved on, nothing sent yet.
    expect(onDecision).not.toHaveBeenCalled();
    expect(screen.getByTestId('prompt-card-progress').textContent).toBe('2 of 2 · multiple choice');

    act(() => {
      textAnswerRef.current?.('Both');
    });
    expect(answersOf(onDecision)).toEqual({
      'Proceed with #143 as described?': 'Ship Odoo first',
      'What do Adobe orders need?': 'Both',
    });
  });
});

describe('the plan card', () => {
  const planRequest: PendingPermissionRequest = { requestId: 'p1', toolName: 'ExitPlanMode', input: { plan: '## Steps\n\n1. Do it' } };

  it('shows the plan and approves it', () => {
    const onDecision = vi.fn();
    render(<PlanApprovalPanel request={planRequest} onDecision={onDecision} />);
    expect(screen.getByTestId('prompt-plan').textContent).toContain('Steps');
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onDecision).toHaveBeenCalledWith('p1', { allow: true });
  });

  it('rejects with the reason typed', () => {
    const onDecision = vi.fn();
    render(<PlanApprovalPanel request={planRequest} onDecision={onDecision} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject with reason' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: 'Skip the migration' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reject and send' }));
    expect(onDecision).toHaveBeenCalledWith('p1', { allow: false, message: 'User asked to revise the plan: Skip the migration' });
  });

  it('takes a message sent from the composer as the rejection reason', () => {
    const textAnswerRef = createRef<PromptTextAnswerHandler | null>() as MutableRefObject<PromptTextAnswerHandler | null>;
    const onDecision = vi.fn();
    render(<PlanApprovalPanel request={planRequest} onDecision={onDecision} textAnswerRef={textAnswerRef} />);
    act(() => {
      textAnswerRef.current?.('Smaller steps');
    });
    expect(onDecision).toHaveBeenCalledWith('p1', { allow: false, message: 'User asked to revise the plan: Smaller steps' });
  });
});

describe('the composer while Claude waits', () => {
  const noop = () => undefined;
  const baseProps = (pendingPermissionRequests: PendingPermissionRequest[]) => ({
    pendingPermissionRequests,
    handlePermissionDecision: noop,
    handleGrantToolPermission: () => ({ success: true }),
    activity: null,
    isLoading: true,
    onAbortSession: noop,
    permissionMode: 'default',
    availablePermissionModes: ['default'],
    onSelectPermissionMode: noop,
    providerLabel: 'Claude',
    effort: 'medium',
    availableEffortOptions: [],
    onSelectEffort: noop,
    model: 'test-model',
    availableModelOptions: [],
    onSelectModel: noop,
    modelsLoading: false,
    tokenBudget: null,
    onShowTokenUsage: noop,
    slashCommandsCount: 0,
    onToggleCommandMenu: noop,
    hasInput: false,
    onClearInput: noop,
    onSubmit: noop,
    isDragActive: false,
    queuedDraft: null,
    backgroundSendPrompt: null,
    onResolveBackgroundSendPrompt: noop,
    isEditingSentMessage: false,
    onCancelEditMessage: noop,
    scheduledMessages: [],
    onScheduleMessage: noop,
    onCancelScheduledMessage: noop,
    onEditQueuedDraft: noop,
    onDeleteQueuedDraft: noop,
    attachedFiles: [],
    onRemoveAttachment: noop,
    fileErrors: new Map(),
    showFileDropdown: false,
    filteredFiles: [],
    selectedFileIndex: -1,
    onSelectFile: noop,
    filteredCommands: [],
    selectedCommandIndex: -1,
    onCommandSelect: noop,
    onCloseCommandMenu: noop,
    isCommandMenuOpen: false,
    frequentCommands: [],
    getRootProps: () => ({}),
    getInputProps: () => ({}),
    openAttachmentPicker: noop,
    inputHighlightRef: createRef<HTMLDivElement>(),
    renderInputWithMentions: (text: string) => text,
    textareaRef: createRef<HTMLTextAreaElement>(),
    input: '',
    onInputChange: noop,
    onTextareaClick: noop,
    onTextareaKeyDown: noop,
    onTextareaPaste: noop,
    onTextareaScrollSync: noop,
    onTextareaInput: noop,
    placeholder: 'Message Claude',
    isTextareaExpanded: false,
  }) as unknown as ComponentProps<typeof ChatComposer>;

  it('replaces the input with the question card', () => {
    render(<UiPreferencesProvider><ChatComposer {...baseProps([questionRequest(SINGLE)])} /></UiPreferencesProvider>);
    expect(screen.getByTestId('prompt-card')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Message Claude')).toBeNull();
  });

  it('replaces the input with the plan card too', () => {
    render(<UiPreferencesProvider><ChatComposer {...baseProps([{ requestId: 'p1', toolName: 'ExitPlanMode', input: { plan: 'Do it' } }])} /></UiPreferencesProvider>);
    expect(screen.getByTestId('prompt-plan')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Message Claude')).toBeNull();
  });

  it('keeps the input for an ordinary permission request', () => {
    render(<UiPreferencesProvider><ChatComposer {...baseProps([{ requestId: 'b1', toolName: 'Bash', input: { command: 'ls' } }])} /></UiPreferencesProvider>);
    expect(screen.queryByTestId('prompt-card')).toBeNull();
    expect(screen.getByPlaceholderText('Message Claude')).toBeTruthy();
  });
});
