import type { ChatMessage, ClaudePermissionSuggestion, PermissionGrantResult } from '@/shared/types';
import { getClaudeSettings, saveClaudePermissions } from '@/modules/chat/utils/chatStorage';

export function buildClaudeToolPermissionEntry(toolName?: string, toolInput?: unknown) {
  if (!toolName) return null;
  if (toolName !== 'Bash') return toolName;

  let parsed: unknown = toolInput;
  if (typeof toolInput === 'string') {
    try {
      parsed = JSON.parse(toolInput) as unknown;
    } catch {
      return toolName;
    }
  }

  const command = parsed && typeof parsed === 'object' && 'command' in parsed && typeof parsed.command === 'string'
    ? parsed.command.trim()
    : '';
  if (!command) return toolName;

  const tokens = command.split(/\s+/);
  if (tokens.length === 0) return toolName;

  if (tokens[0] === 'git' && tokens[1]) {
    return `Bash(${tokens[0]} ${tokens[1]}:*)`;
  }
  return `Bash(${tokens[0]}:*)`;
}

export function formatToolInputForDisplay(input: unknown) {
  if (input === undefined || input === null) return '';
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

export function getClaudePermissionSuggestion(
  message: ChatMessage | null | undefined,
  provider: string,
): ClaudePermissionSuggestion | null {
  if (provider !== 'claude') return null;
  if (!message?.toolResult?.isError) return null;

  const toolName = message?.toolName;
  const entry = buildClaudeToolPermissionEntry(toolName, message.toolInput);
  if (!entry) return null;

  const settings = getClaudeSettings();
  const isAllowed = settings.allowedTools.includes(entry);
  return { toolName: toolName || 'UnknownTool', entry, isAllowed };
}

export function grantClaudeToolPermission(entry: string | null): PermissionGrantResult {
  if (!entry) return { success: false };

  const settings = getClaudeSettings();
  const alreadyAllowed = settings.allowedTools.includes(entry);
  const nextAllowed = alreadyAllowed ? settings.allowedTools : [...settings.allowedTools, entry];
  const nextDisallowed = settings.disallowedTools.filter((tool) => tool !== entry);
  const updatedSettings = {
    ...settings,
    allowedTools: nextAllowed,
    disallowedTools: nextDisallowed,
  };

  saveClaudePermissions({
    allowedTools: nextAllowed,
    disallowedTools: nextDisallowed,
    skipPermissions: settings.skipPermissions,
  });
  return { success: true, alreadyAllowed, updatedSettings };
}

/** The field of a tool's input that says what the call would do, by tool. */
export type PermissionSubjectKind = 'command' | 'file' | 'url' | 'query' | 'pattern' | 'task';

const PERMISSION_SUBJECT_FIELDS: Array<{ tools: string[]; field: string; kind: PermissionSubjectKind }> = [
  { tools: ['Bash', 'PowerShell'], field: 'command', kind: 'command' },
  { tools: ['Edit', 'MultiEdit', 'Write', 'Read', 'NotebookEdit'], field: 'file_path', kind: 'file' },
  { tools: ['NotebookEdit'], field: 'notebook_path', kind: 'file' },
  { tools: ['WebFetch'], field: 'url', kind: 'url' },
  { tools: ['WebSearch'], field: 'query', kind: 'query' },
  { tools: ['Grep', 'Glob'], field: 'pattern', kind: 'pattern' },
  { tools: ['Task', 'Agent'], field: 'description', kind: 'task' },
];

/**
 * What a pending permission request would do, in one line a person can judge
 * at a glance — the command, the file, the URL — instead of the raw JSON input.
 * Null for tools whose input has no single field that says it.
 */
export function summarizePermissionInput(
  toolName: string,
  input: unknown,
): { kind: PermissionSubjectKind; value: string } | null {
  let parsed: unknown = input;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input) as unknown;
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  for (const { tools, field, kind } of PERMISSION_SUBJECT_FIELDS) {
    const value = record[field];
    if (tools.includes(toolName) && typeof value === 'string' && value.trim()) {
      return { kind, value };
    }
  }
  return null;
}

/** Pending requests in the order they were asked, oldest first. */
export function orderPermissionRequests<T extends { receivedAt?: Date | string }>(requests: T[]): T[] {
  const askedAt = (request: T) => {
    const time = request.receivedAt ? new Date(request.receivedAt).getTime() : Number.NaN;
    return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
  };
  // Stable, so requests without a time keep their arrival order after the timed ones.
  return [...requests].sort((left, right) => {
    const leftTime = askedAt(left);
    const rightTime = askedAt(right);
    if (leftTime === rightTime) return 0;
    return leftTime < rightTime ? -1 : 1;
  });
}
