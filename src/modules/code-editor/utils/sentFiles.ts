import type { SentFileSummary } from '@/shared/types';

/** Window event that asks the editor side panel to open a sent file. Detail: SentFileSummary. */
export const OPEN_SENT_FILE_EVENT = 'cloudcli:open-sent-file';

const SEND_USER_FILE_TOOL_SUFFIX = '__send_user_file';
const SENT_FILES_MARKER = '{"sentFiles":';

export const requestSentFileOpen = (sentFile: SentFileSummary): void => {
  window.dispatchEvent(new CustomEvent<SentFileSummary>(OPEN_SENT_FILE_EVENT, { detail: sentFile }));
};

/** Matches the send_user_file tool whatever MCP namespace prefix the provider gives it. */
export const isSendUserFileTool = (toolName: string): boolean => toolName.endsWith(SEND_USER_FILE_TOOL_SUFFIX);

const contentToText = (content: unknown): string => {
  if (typeof content === 'string') {
    // History ships MCP content blocks as a JSON-encoded array string.
    if (content.trimStart().startsWith('[')) {
      try {
        return contentToText(JSON.parse(content));
      } catch {
        return content;
      }
    }
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => (block && typeof block === 'object' && 'text' in block ? String((block as { text: unknown }).text) : ''))
      .join('\n');
  }
  return '';
};

/** Reads the file list from a send_user_file result; the tool appends it as one JSON text block. */
export const parseSentFilesResult = (toolResult: unknown): SentFileSummary[] => {
  const content = toolResult && typeof toolResult === 'object' && 'content' in toolResult
    ? (toolResult as { content: unknown }).content
    : toolResult;
  const text = contentToText(content);
  const start = text.indexOf(SENT_FILES_MARKER);
  if (start === -1) return [];
  const end = text.lastIndexOf('}');
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { sentFiles?: SentFileSummary[] };
    return Array.isArray(parsed.sentFiles) ? parsed.sentFiles.filter((file) => typeof file?.id === 'string') : [];
  } catch {
    // A truncated or edited transcript entry: show the plain tool output instead.
    return [];
  }
};
