import { describe, expect, it } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import '@/modules/i18n';
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

  it('shows a compact Questions summary with each answer, expanding to the full card', () => {
    render(
      <ToolRenderer
        toolName="AskUserQuestion"
        toolInput={{ questions: QUESTIONS, answers: { 'Which database?': 'Postgres' } }}
        toolResult={{ content: 'ok', isError: false }}
        mode="input"
      />,
    );
    const toggle = screen.getByRole('button', { name: 'Questions' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('Database')).toBeTruthy();
    expect(screen.getByText('Postgres')).toBeTruthy();
    expect(screen.getByText('Skipped')).toBeTruthy();
    // The full card, with the question text, is behind the toggle.
    expect(screen.queryByText('Add tests?')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Add tests?')).toBeTruthy();
  });

  it('keeps the full card while the questions are unanswered', () => {
    render(
      <ToolRenderer toolName="AskUserQuestion" toolInput={{ questions: QUESTIONS }} mode="input" />,
    );
    expect(screen.queryByRole('button', { name: 'Questions' })).toBeNull();
    expect(screen.getByText('Which database?')).toBeTruthy();
  });
});
