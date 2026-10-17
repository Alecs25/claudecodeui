import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import '@/modules/i18n';
import ActivityIndicator from '@/modules/chat/composer/ActivityIndicator';
import { hasForegroundBackgroundableCall } from '@/modules/chat/utils/backgroundTasks';
import type { ChatMessage, SessionActivity } from '@/shared/types';

const row = (overrides: Partial<ChatMessage>): ChatMessage => ({
  type: 'assistant',
  content: '',
  timestamp: '2026-08-21T10:32:10.000Z',
  ...overrides,
});

const toolCall = (toolName: string, input: Record<string, unknown>, overrides: Partial<ChatMessage> = {}) =>
  row({ isToolUse: true, toolName, toolId: `toolu_${toolName}`, toolInput: JSON.stringify(input), ...overrides });

describe('hasForegroundBackgroundableCall', () => {
  it('finds a blocking command or subagent the turn is waiting on', () => {
    expect(hasForegroundBackgroundableCall([row({ type: 'user' }), toolCall('Bash', { command: 'npm test' })])).toBe(true);
    expect(hasForegroundBackgroundableCall([row({ type: 'user' }), toolCall('Agent', { description: 'Survey', prompt: 'x' })])).toBe(true);
  });

  it('ignores calls that already returned, were launched in the background, or cannot be moved', () => {
    const settled = { content: 'ok', isError: false };
    expect(hasForegroundBackgroundableCall([toolCall('Bash', { command: 'ls' }, { toolResult: settled })])).toBe(false);
    expect(hasForegroundBackgroundableCall([toolCall('Bash', { command: 'npm run dev', run_in_background: true })])).toBe(false);
    expect(hasForegroundBackgroundableCall([toolCall('Read', { file_path: 'a.ts' })])).toBe(false);
  });

  it('looks only at the current turn', () => {
    // A call left without a result by an earlier, interrupted turn is not
    // something this turn is waiting on.
    expect(hasForegroundBackgroundableCall([toolCall('Bash', { command: 'sleep 100' }), row({ type: 'user' })])).toBe(false);
  });
});

describe('the activity indicator\'s Background button', () => {
  const turn: SessionActivity = { statusText: null, canInterrupt: true, startedAt: Date.now() };

  it('moves the blocking call to the background when offered', () => {
    const onRunInBackground = vi.fn();
    render(<ActivityIndicator activity={turn} onAbort={() => {}} onRunInBackground={onRunInBackground} />);

    fireEvent.click(screen.getByRole('button', { name: 'Background' }));
    expect(onRunInBackground).toHaveBeenCalledTimes(1);
  });

  it('is absent when nothing can be moved, and once the turn itself is only background work', () => {
    const { rerender } = render(<ActivityIndicator activity={turn} onAbort={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Background' })).toBeNull();

    rerender(
      <ActivityIndicator activity={{ ...turn, canInterrupt: false, background: true, tasks: [] }} onRunInBackground={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: 'Background' })).toBeNull();
  });
});
