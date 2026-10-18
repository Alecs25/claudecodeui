import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import '@/modules/i18n';
import MessageComponent from '@/modules/chat/transcript/MessageComponent';
import {
  isSuggestSessionTool,
  readSessionSuggestion,
  takePendingSuggestedPrompt,
} from '@/modules/chat/utils/sessionSuggestions';
import { groupConsecutiveTools, isToolGroupItem } from '@/modules/chat/utils/toolGrouping';
import { START_SUGGESTED_SESSION_EVENT } from '@/shared/constants';
import type { ChatMessage, Project } from '@/shared/types';

const SUGGEST_TOOL = 'mcp__cloudcli-tasks__suggest_session';

const suggestion = {
  title: 'Remove the unused export helper',
  summary: 'No callers left after the parser fix.',
  prompt: 'In src/utils/export.ts remove exportHelper and its tests.',
};

const project = { projectId: 'p1', name: 'app', displayName: 'app', fullPath: '/app', path: '/app' } as unknown as Project;

const suggestionRow = (toolId: string, overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  type: 'tool',
  content: '',
  timestamp: '2026-10-18T10:00:00.000Z',
  isToolUse: true,
  toolName: SUGGEST_TOOL,
  toolId,
  toolInput: suggestion,
  toolResult: { content: 'Suggestion shown.', isError: false },
  ...overrides,
});

const renderRow = (message: ChatMessage) => render(
  <MessageComponent message={message} prevMessage={null} createDiff={() => []} provider="claude" selectedProject={project} />,
);

describe('session suggestions', () => {
  afterEach(() => {
    window.localStorage.clear();
    takePendingSuggestedPrompt('p1');
  });

  it('recognises suggest_session and reads either input shape', () => {
    expect(isSuggestSessionTool(SUGGEST_TOOL)).toBe(true);
    expect(isSuggestSessionTool('mcp__cloudcli-chapters__mark_chapter')).toBe(false);
    expect(readSessionSuggestion(JSON.stringify(suggestion))).toEqual(suggestion);
    expect(readSessionSuggestion({ title: 'x' })).toBeNull();
    expect(readSessionSuggestion('{"title":"Re')).toBeNull();
  });

  it('never folds a suggestion into a collapsed tool summary', () => {
    const items = groupConsecutiveTools([
      { type: 'tool', content: '', timestamp: 't', isToolUse: true, toolName: 'Read', toolId: 'r', toolInput: '{}' },
      suggestionRow('s'),
    ]);
    expect(items.map(isToolGroupItem)).toEqual([true, false]);
  });

  it('starts the suggestion as a new session and remembers it', () => {
    const onStart = vi.fn();
    window.addEventListener(START_SUGGESTED_SESSION_EVENT, onStart);
    renderRow(suggestionRow('tool-1'));

    expect(screen.getByText(suggestion.title)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
    window.removeEventListener(START_SUGGESTED_SESSION_EVENT, onStart);

    expect(onStart).toHaveBeenCalledTimes(1);
    expect((onStart.mock.calls[0][0] as CustomEvent).detail).toEqual({ project, prompt: suggestion.prompt });
    expect(takePendingSuggestedPrompt('p1')).toBe(suggestion.prompt);
    expect(takePendingSuggestedPrompt('p1')).toBeNull();
    expect(screen.getByText('Session started')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start session' })).toBeNull();
  });

  it('shows a dismissed suggestion as such when the transcript is opened again', () => {
    const { unmount } = renderRow(suggestionRow('tool-2'));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    unmount();

    renderRow(suggestionRow('tool-2'));
    expect(screen.getByText('Dismissed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start session' })).toBeNull();
  });

  it('keeps the plain tool row for a refused call', () => {
    renderRow(suggestionRow('tool-3', { toolResult: { content: 'title is too long', isError: true } }));
    expect(screen.queryByTestId('session-suggestion')).toBeNull();
  });
});
