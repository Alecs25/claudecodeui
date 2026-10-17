import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import '@/modules/i18n';
import ChaptersMenu from '@/modules/chat/transcript/ChaptersMenu';
import MessageComponent from '@/modules/chat/transcript/MessageComponent';
import { isMarkChapterTool, listChapters, readChapterInput } from '@/modules/chat/utils/chapters';
import { groupConsecutiveTools, isToolGroupItem } from '@/modules/chat/utils/toolGrouping';
import { buildTranscriptMarkdown } from '@/modules/chat/export/buildTranscriptMarkdown';
import type { ChatMessage } from '@/shared/types';

const CHAPTER_TOOL = 'mcp__cloudcli-chapters__mark_chapter';

const toolRow = (overrides: Partial<ChatMessage>): ChatMessage => ({
  type: 'tool',
  content: '',
  timestamp: '2026-10-17T10:00:00.000Z',
  isToolUse: true,
  ...overrides,
});

const chapterRow = (toolId: string, input: unknown, overrides: Partial<ChatMessage> = {}): ChatMessage => toolRow({
  toolName: CHAPTER_TOOL,
  toolId,
  toolInput: input,
  toolResult: { content: 'Chapter marked.', isError: false },
  ...overrides,
});

describe('chapters', () => {
  it('recognises mark_chapter under any MCP namespace and reads either input shape', () => {
    expect(isMarkChapterTool(CHAPTER_TOOL)).toBe(true);
    expect(isMarkChapterTool('mcp__ccd_session__mark_chapter')).toBe(true);
    expect(isMarkChapterTool('mcp__cloudcli-visualize__show_widget')).toBe(false);
    expect(readChapterInput({ title: ' Fix ', summary: 'why' })).toEqual({ title: 'Fix', summary: 'why' });
    expect(readChapterInput('{"title":"Fix"}')).toEqual({ title: 'Fix', summary: '' });
    expect(readChapterInput('{"title":"Fi')).toEqual({ title: '', summary: '' });
  });

  it('lists only valid chapters, in order, skipping refused and still-streaming calls', () => {
    const messages = [
      chapterRow('a', { title: 'Exploration' }),
      toolRow({ toolName: 'Read', toolId: 'r', toolInput: '{}' }),
      chapterRow('b', { title: 'x'.repeat(50) }, { toolResult: { content: 'too long', isError: true } }),
      chapterRow('c', '{"title":"Implemen', { toolResult: undefined }),
      chapterRow('d', '{"title":"Verification","summary":"Run the tests"}'),
    ];
    expect(listChapters(messages).map((chapter) => chapter.title)).toEqual(['Exploration', 'Verification']);
  });

  it('never folds a chapter into a collapsed tool summary', () => {
    const items = groupConsecutiveTools([
      toolRow({ toolName: 'Read', toolId: 'r', toolInput: '{}' }),
      chapterRow('a', { title: 'Implementation' }),
      toolRow({ toolName: 'Edit', toolId: 'e', toolInput: '{}' }),
    ]);
    expect(items.map(isToolGroupItem)).toEqual([true, false, true]);
  });

  it('renders a chapter row as a divider with its title, not as a tool row', () => {
    render(
      <MessageComponent
        message={chapterRow('a', { title: 'Auth bug fix', summary: 'Token refresh' })}
        prevMessage={null}
        createDiff={() => []}
        provider="claude"
      />,
    );
    const divider = screen.getByRole('separator', { name: 'Auth bug fix' });
    expect(divider.id).toBe('chapter-a');
    expect(screen.getByText('Token refresh')).toBeTruthy();
    expect(screen.queryByText(/mark_chapter/)).toBeNull();
  });

  it('lists the chapters and reveals the one clicked', () => {
    const onReveal = vi.fn();
    const messages = [chapterRow('a', { title: 'Exploration' }), chapterRow('b', { title: 'Verification' })];
    render(<ChaptersMenu messages={messages} onReveal={onReveal} />);

    fireEvent.click(screen.getByRole('button', { name: 'Chapters' }));
    fireEvent.click(screen.getByRole('button', { name: /Verification/ }));
    expect(onReveal).toHaveBeenCalledWith(messages[1]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders nothing while the session has no chapter', () => {
    const { container } = render(<ChaptersMenu messages={[toolRow({ toolName: 'Read', toolId: 'r' })]} onReveal={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('exports a chapter as a Markdown heading', () => {
    const markdown = buildTranscriptMarkdown({
      messages: [chapterRow('a', { title: 'Verification', summary: 'Run the tests' })],
      sessionTitle: 'Session',
      provider: 'claude',
      exportedAt: new Date('2026-10-17T10:00:00.000Z'),
      createDiff: () => [],
    });
    expect(markdown).toContain('## Verification');
    expect(markdown).toContain('_Run the tests_');
    expect(markdown).not.toContain('mark_chapter');
  });
});
