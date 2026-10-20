import { describe, expect, it } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import '@/modules/i18n';
import PermissionContext from '@/modules/chat/context/PermissionContext';
import { TranscriptSessionContext } from '@/modules/chat/context/TranscriptSessionContext';
import { ToolRenderer } from '@/modules/chat/tools/ToolRenderer';
import { hasQuestionAnswers } from '@/modules/chat/utils/questionAnswers';

const QUESTIONS = [
  { question: 'Which database?', header: 'Database', options: [{ label: 'Postgres' }, { label: 'SQLite' }] },
  { question: 'Add tests?', header: 'Tests', options: [{ label: 'Yes' }, { label: 'No' }] },
];

describe('answered question cards', () => {
  it('knows when a question set has an answer', () => {
    expect(hasQuestionAnswers(QUESTIONS, {})).toBe(false);
    expect(hasQuestionAnswers(QUESTIONS, undefined)).toBe(false);
    expect(hasQuestionAnswers(QUESTIONS, { 'Which database?': 'Postgres' })).toBe(true);
    expect(hasQuestionAnswers('not an array', { 'Which database?': 'Postgres' })).toBe(false);
  });

  it('shows a compact "Questions · N answers" summary, expanding to the full card', () => {
    render(
      <ToolRenderer
        toolName="AskUserQuestion"
        toolInput={{ questions: QUESTIONS, answers: { 'Which database?': 'Postgres (Recommended)' } }}
        toolResult={{ content: 'ok', isError: false }}
        mode="input"
      />,
    );
    const toggle = screen.getByRole('button', { name: 'Questions · 1 answer' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('Database')).toBeTruthy();
    // The recommendation mark is the model's, not part of the answer the user reads.
    expect(screen.getByText('Postgres')).toBeTruthy();
    expect(screen.getByText('Skipped')).toBeTruthy();
    // The full card, with the question text, is behind the toggle.
    expect(screen.queryByText('Add tests?')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Add tests?')).toBeTruthy();
  });

  it('an open question is a slim waiting line, never "Skipped" or a running tool row', () => {
    render(
      <PermissionContext.Provider
        value={{
          pendingPermissionRequests: [{ requestId: 'q1', toolName: 'AskUserQuestion', input: { questions: QUESTIONS } }],
          handlePermissionDecision: () => undefined,
        }}
      >
        <ToolRenderer toolName="AskUserQuestion" toolInput={{ questions: QUESTIONS }} mode="input" />
      </PermissionContext.Provider>,
    );
    expect(screen.getByTestId('question-state-pending').textContent).toContain('Questions · waiting');
    expect(screen.queryByText(/skipped/i)).toBeNull();
    expect(screen.queryByText('Running')).toBeNull();
  });

  it('a question with no result yet is waiting while the run goes on', () => {
    render(
      <TranscriptSessionContext.Provider value={{ sessionId: 's1', isRunning: true }}>
        <ToolRenderer toolName="AskUserQuestion" toolInput={{ questions: QUESTIONS.slice(0, 1) }} mode="input" />
      </TranscriptSessionContext.Provider>,
    );
    expect(screen.getByTestId('question-state-pending').textContent).toContain('Question · waiting');
  });

  it('is skipped only when the answer came back empty, and cancelled when the run stopped first', () => {
    const { unmount } = render(
      <ToolRenderer
        toolName="AskUserQuestion"
        toolInput={{ questions: QUESTIONS, answers: {} }}
        toolResult={{ content: 'User skipped', isError: false }}
        mode="input"
      />,
    );
    expect(screen.getByRole('button', { name: /Questions · skipped/ })).toBeTruthy();
    unmount();

    // No result and the run is over: it was stopped while asking.
    const view = render(<ToolRenderer toolName="AskUserQuestion" toolInput={{ questions: QUESTIONS }} mode="input" />);
    expect(screen.getByRole('button', { name: /Questions · cancelled/ })).toBeTruthy();
    view.unmount();

    render(
      <ToolRenderer
        toolName="AskUserQuestion"
        toolInput={{ questions: QUESTIONS }}
        toolResult={{ content: 'Permission request cancelled', isError: true }}
        mode="input"
      />,
    );
    expect(screen.getByRole('button', { name: /Questions · cancelled/ })).toBeTruthy();
  });
});
