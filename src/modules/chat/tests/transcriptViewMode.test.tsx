import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';

import '@/modules/i18n';
import {
  getNextTranscriptViewMode,
  getTranscriptViewMode,
  getTranscriptViewModePreferences,
} from '@/shared/uiPreferences';
import {
  isTranscriptViewModeShortcut,
  useTranscriptViewModeShortcut,
} from '@/modules/chat/hooks/useTranscriptViewModeShortcut';
import TranscriptVerboseContext from '@/modules/chat/context/TranscriptViewModeContext';
import ToolGroupContainer from '@/modules/chat/transcript/ToolGroupContainer';
import { ToolRenderer } from '@/modules/chat/tools/ToolRenderer';
import { groupConsecutiveTools, isToolGroupItem } from '@/modules/chat/utils/toolGrouping';
import type { ChatMessage, ToolGroupItem } from '@/shared/types';

describe('transcript view modes', () => {
  it('reads the mode from the two stored booleans, keeping old combinations meaningful', () => {
    expect(getTranscriptViewMode({ showThinking: false, showRawParameters: false })).toBe('normal');
    expect(getTranscriptViewMode({ showThinking: true, showRawParameters: false })).toBe('thinking');
    expect(getTranscriptViewMode({ showThinking: true, showRawParameters: true })).toBe('verbose');
    // Raw parameters on with thinking off was possible with the old toggles.
    expect(getTranscriptViewMode({ showThinking: false, showRawParameters: true })).toBe('verbose');
  });

  it('writes each mode back as the booleans and round-trips', () => {
    for (const mode of ['normal', 'thinking', 'verbose'] as const) {
      expect(getTranscriptViewMode(getTranscriptViewModePreferences(mode))).toBe(mode);
    }
    expect(getTranscriptViewModePreferences('verbose')).toEqual({ showThinking: true, showRawParameters: true });
  });

  it('cycles normal, thinking, verbose and back', () => {
    expect(getNextTranscriptViewMode('normal')).toBe('thinking');
    expect(getNextTranscriptViewMode('thinking')).toBe('verbose');
    expect(getNextTranscriptViewMode('verbose')).toBe('normal');
  });

  it('cycles on Ctrl+O only while the chat is active', () => {
    const base = { metaKey: false, altKey: false, shiftKey: false };
    expect(isTranscriptViewModeShortcut({ ...base, key: 'o', ctrlKey: true })).toBe(true);
    expect(isTranscriptViewModeShortcut({ ...base, key: 'o', ctrlKey: false })).toBe(false);
    expect(isTranscriptViewModeShortcut({ ...base, key: 'o', ctrlKey: true, shiftKey: true })).toBe(false);

    const onChange = vi.fn();
    const { rerender } = renderHook(
      ({ active }) => useTranscriptViewModeShortcut(active, 'thinking', onChange),
      { initialProps: { active: true } },
    );
    fireEvent.keyDown(window, { key: 'o', ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith('verbose');

    rerender({ active: false });
    fireEvent.keyDown(window, { key: 'o', ctrlKey: true });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('opens collapsed tool groups in verbose mode', () => {
    const read: ChatMessage = {
      type: 'tool',
      content: '',
      timestamp: '2026-10-17T10:00:00.000Z',
      isToolUse: true,
      toolName: 'Read',
      toolId: 'toolu_read',
      toolInput: { file_path: '/repo/a.ts' },
      toolResult: { content: 'x', isError: false },
    };
    const [group] = groupConsecutiveTools([read]);
    expect(isToolGroupItem(group)).toBe(true);

    const renderGroup = (verbose: boolean) => render(
      <TranscriptVerboseContext.Provider value={verbose}>
        <ToolGroupContainer
          group={group as ToolGroupItem}
          prevMessage={null}
          createDiff={() => []}
          getMessageKey={() => 'k'}
          provider="claude"
          showRawParameters={verbose}
        />
      </TranscriptVerboseContext.Provider>,
    );

    const compact = renderGroup(false);
    expect(compact.container.querySelector('[aria-expanded="false"]')).toBeTruthy();
    compact.unmount();

    const verbose = renderGroup(true);
    expect(verbose.container.querySelector('[aria-expanded="true"]')).toBeTruthy();
    // The raw input of an object-shaped (history) tool input is shown, open.
    const raw = screen.getByText(/"file_path": "\/repo\/a.ts"/);
    expect(raw.closest('[data-state]')?.getAttribute('data-state')).toBe('open');
  });

  it('shows the raw input under a one-line tool row only with raw parameters on', () => {
    const props = {
      toolName: 'Read',
      toolInput: { file_path: '/repo/a.ts' },
      toolResult: { content: 'x', isError: false },
      mode: 'input' as const,
      rawToolInput: '{"file_path":"/repo/a.ts"}',
    };
    const { rerender } = render(<ToolRenderer {...props} showRawParameters={false} />);
    expect(screen.queryByText('Raw parameters')).toBeNull();
    rerender(<ToolRenderer {...props} showRawParameters />);
    expect(screen.getByText('Raw parameters')).toBeTruthy();
  });
});
