import type { ChatMessage } from '@/shared/types';

/**
 * Chapters: the mark_chapter MCP tool (cloudcli-chapters) lets the agent split a
 * long session into phases, like the Claude desktop app. The title lives in the
 * tool input, so live rows and rows loaded from history read the same way.
 */

const MARK_CHAPTER_TOOL_SUFFIX = '__mark_chapter';

export type TranscriptChapter = {
  /** The row that marked the chapter, which the table of contents reveals. */
  message: ChatMessage;
  title: string;
  summary: string;
};

/** Matches the tool whatever MCP namespace prefix the provider gives it. */
export const isMarkChapterTool = (toolName: string | undefined | null): boolean =>
  typeof toolName === 'string' && toolName.endsWith(MARK_CHAPTER_TOOL_SUFFIX);

/** DOM id of a chapter's divider, so the table of contents can land on it exactly. */
export const getChapterAnchorId = (message: ChatMessage): string =>
  `chapter-${message.toolId || message.timestamp}`;

/** Reads title and summary from the tool input, whichever shape the provider stored it in. */
export const readChapterInput = (toolInput: unknown): { title: string; summary: string } => {
  let input = toolInput;
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch {
      // Still streaming: the JSON is incomplete until the call is fully written.
      return { title: '', summary: '' };
    }
  }
  if (!input || typeof input !== 'object') {
    return { title: '', summary: '' };
  }
  const record = input as Record<string, unknown>;
  return {
    title: typeof record.title === 'string' ? record.title.trim() : '',
    summary: typeof record.summary === 'string' ? record.summary.trim() : '',
  };
};

/** A chapter the tool refused (empty or overlong title) is not one: the model retries with a valid call. */
export const readChapter = (message: ChatMessage): TranscriptChapter | null => {
  if (!message.isToolUse || !isMarkChapterTool(message.toolName) || message.toolResult?.isError) {
    return null;
  }
  const { title, summary } = readChapterInput(message.toolInput);
  return title ? { message, title, summary } : null;
};

/** Every chapter among the loaded rows, in transcript order. */
export const listChapters = (messages: ChatMessage[]): TranscriptChapter[] => {
  const chapters: TranscriptChapter[] = [];
  for (const message of messages) {
    const chapter = readChapter(message);
    if (chapter) {
      chapters.push(chapter);
    }
  }
  return chapters;
};
