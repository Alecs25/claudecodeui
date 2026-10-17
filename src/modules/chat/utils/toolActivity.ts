import type { ToolActivityCounts, ToolActivityKind } from '@/shared/types';

/** Order the collapsed summary names the kinds in, e.g. "Ran 2 commands, read 3 files". */
export const TOOL_ACTIVITY_ORDER: ToolActivityKind[] = ['command', 'read', 'search', 'edit', 'web', 'todo', 'other'];

const COMMAND_TOOLS = new Set(['Bash', 'PowerShell', 'exec', 'BashOutput', 'KillShell', 'KillBash']);
const READ_TOOLS = new Set(['Read', 'NotebookRead']);
const SEARCH_TOOLS = new Set(['Grep', 'Glob', 'LS']);
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'ApplyPatch', 'NotebookEdit']);
const WEB_TOOLS = new Set(['WebFetch', 'WebSearch']);
const TODO_TOOLS = new Set(['TodoWrite', 'TodoRead', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet']);

// Tools whose row is the point of the call: the user has to answer it, approve it
// or look at what it produced. Folding them into a collapsed summary would hide
// exactly what the agent wanted the user to see.
const ALWAYS_VISIBLE_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode', 'exit_plan_mode', 'Workflow']);
const ALWAYS_VISIBLE_MCP_SUFFIXES = ['__send_user_file', '__show_widget', '__mark_chapter'];

// Claude exposes PowerShell next to Bash on Windows: the same interaction, so
// the same command row with its output inline.
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

export function isShellTool(toolName: string): boolean {
  return SHELL_TOOLS.has(toolName);
}

export function getToolActivityKind(toolName: string): ToolActivityKind {
  if (COMMAND_TOOLS.has(toolName)) return 'command';
  if (READ_TOOLS.has(toolName)) return 'read';
  if (SEARCH_TOOLS.has(toolName)) return 'search';
  if (EDIT_TOOLS.has(toolName)) return 'edit';
  if (WEB_TOOLS.has(toolName)) return 'web';
  if (TODO_TOOLS.has(toolName)) return 'todo';
  return 'other';
}

export function isAlwaysVisibleTool(toolName: string): boolean {
  return ALWAYS_VISIBLE_TOOLS.has(toolName)
    || ALWAYS_VISIBLE_MCP_SUFFIXES.some((suffix) => toolName.endsWith(suffix));
}

export function countToolActivity(toolNames: string[]): ToolActivityCounts {
  const counts: ToolActivityCounts = {};
  for (const toolName of toolNames) {
    const kind = getToolActivityKind(toolName);
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}
