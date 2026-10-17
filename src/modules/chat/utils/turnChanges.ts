import type { ChatMessage } from '@/shared/types';
import { isToolGroupItem, type MessageListItem } from '@/modules/chat/utils/toolGrouping';

/** One change a tool call made to a file: the replaced text and its replacement. */
export type TurnFileEdit = {
  oldContent: string;
  newContent: string;
  /** `write` replaces the whole file, so its old side is unknown and shown empty. */
  kind: 'edit' | 'write';
};

/** Every change one turn made to one file, in the order the calls ran. */
export type TurnFileChange = {
  filePath: string;
  edits: TurnFileEdit[];
};

// The tools whose input carries the change itself. Bash and NotebookEdit also
// touch files, but their input says nothing a diff could be drawn from.
const FILE_EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'ApplyPatch']);

function readToolInput(toolInput: unknown): Record<string, unknown> | null {
  if (toolInput && typeof toolInput === 'object') {
    return toolInput as Record<string, unknown>;
  }
  if (typeof toolInput !== 'string') {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(toolInput);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

function readEdits(toolName: string, input: Record<string, unknown>): TurnFileEdit[] {
  if (toolName === 'Write') {
    return [{ oldContent: '', newContent: asText(input.content), kind: 'write' }];
  }
  if (toolName === 'MultiEdit') {
    const edits = Array.isArray(input.edits) ? input.edits : [];
    return edits
      .filter((edit): edit is Record<string, unknown> => Boolean(edit) && typeof edit === 'object')
      .map((edit) => ({ oldContent: asText(edit.old_string), newContent: asText(edit.new_string), kind: 'edit' as const }));
  }
  return [{ oldContent: asText(input.old_string), newContent: asText(input.new_string), kind: 'edit' }];
}

/**
 * The files a run of transcript rows changed through edit tools, grouped by
 * file in first-touched order. Failed calls changed nothing and are skipped.
 */
export function collectFileChanges(messages: ChatMessage[]): TurnFileChange[] {
  const byPath = new Map<string, TurnFileChange>();
  for (const message of messages) {
    const toolName = message.toolName ?? '';
    if (!message.isToolUse || !FILE_EDIT_TOOLS.has(toolName) || message.toolResult?.isError) {
      continue;
    }
    const input = readToolInput(message.toolInput);
    const filePath = input ? asText(input.file_path) : '';
    if (!input || !filePath) {
      continue;
    }
    const entry = byPath.get(filePath) ?? { filePath, edits: [] };
    entry.edits.push(...readEdits(toolName, input));
    byPath.set(filePath, entry);
  }
  return [...byPath.values()].filter((entry) => entry.edits.length > 0);
}

/**
 * Where each turn of a rendered transcript ends and what it changed: keys are
 * the index of a turn's last item in `items`, values its file changes. Turns
 * that changed nothing are left out. The last turn is included only when
 * `includeLastTurn` is set, so a turn still running gets no button that would
 * list half of its changes.
 */
export function findTurnFileChanges(
  items: MessageListItem[],
  includeLastTurn: boolean,
): Map<number, TurnFileChange[]> {
  const result = new Map<number, TurnFileChange[]>();
  let turnMessages: ChatMessage[] = [];
  let turnLastIndex = -1;

  const closeTurn = () => {
    if (turnLastIndex >= 0 && turnMessages.length > 0) {
      const changes = collectFileChanges(turnMessages);
      if (changes.length > 0) {
        result.set(turnLastIndex, changes);
      }
    }
    turnMessages = [];
    turnLastIndex = -1;
  };

  items.forEach((item, index) => {
    if (isToolGroupItem(item)) {
      turnMessages.push(...item.messages);
      turnLastIndex = index;
      return;
    }
    if (item.type === 'user') {
      closeTurn();
      return;
    }
    turnMessages.push(item);
    turnLastIndex = index;
  });

  if (includeLastTurn) {
    closeTurn();
  }
  return result;
}
