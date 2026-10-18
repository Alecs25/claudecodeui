import { START_SUGGESTED_SESSION_EVENT } from '@/shared/constants';
import type { Project, StartSuggestedSessionDetail } from '@/shared/types';

/**
 * Session suggestions: the suggest_session MCP tool (cloudcli-tasks) lets the
 * agent flag out-of-scope work as a card; one tap starts it as a new session
 * in the same project, with the suggestion's prompt as the first message.
 */

const SUGGEST_SESSION_TOOL_SUFFIX = '__suggest_session';
// What the user did with each card, by tool id, so a reload or the history
// view shows it as started or dismissed instead of offering it again.
const SUGGESTION_STATE_STORAGE_KEY = 'cloudcli.sessionSuggestions';
// Old decisions are of no use once their transcripts scroll out of reach.
const MAX_STORED_SUGGESTIONS = 300;

export type SessionSuggestion = {
  title: string;
  summary: string;
  prompt: string;
};

export type SessionSuggestionState = 'started' | 'dismissed';

export const isSuggestSessionTool = (toolName: string | undefined | null): boolean =>
  typeof toolName === 'string' && toolName.endsWith(SUGGEST_SESSION_TOOL_SUFFIX);

/** The suggestion in a tool input (object or JSON string), or null when a field is missing. */
export const readSessionSuggestion = (toolInput: unknown): SessionSuggestion | null => {
  let input = toolInput;
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (!input || typeof input !== 'object') {
    return null;
  }
  const record = input as Record<string, unknown>;
  const read = (key: string) => (typeof record[key] === 'string' ? (record[key] as string).trim() : '');
  const suggestion = { title: read('title'), summary: read('summary'), prompt: read('prompt') };
  return suggestion.title && suggestion.prompt ? suggestion : null;
};

const readStoredStates = (): Record<string, SessionSuggestionState> => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SUGGESTION_STATE_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const readSuggestionState = (toolId: string | undefined): SessionSuggestionState | null =>
  (toolId ? readStoredStates()[toolId] ?? null : null);

export const writeSuggestionState = (toolId: string | undefined, state: SessionSuggestionState): void => {
  if (!toolId) {
    return;
  }
  const states = readStoredStates();
  delete states[toolId];
  states[toolId] = state;
  // Insertion order is age: drop the oldest decisions first.
  const entries = Object.entries(states).slice(-MAX_STORED_SUGGESTIONS);
  try {
    window.localStorage.setItem(SUGGESTION_STATE_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch (error) {
    console.warn('Could not save the session suggestion state:', error);
  }
};

// The prompt waiting for the new session's composer, by project. Module state
// on purpose: it only has to survive the hop from the card to the composer of
// the session that opens next, within this tab.
const pendingPrompts = new Map<string, string>();

/** Hands the prompt to the next new-session composer of the project and asks the workspace to open one. */
export const startSuggestedSession = (project: Project, prompt: string): void => {
  pendingPrompts.set(project.projectId, prompt);
  window.dispatchEvent(new CustomEvent<StartSuggestedSessionDetail>(START_SUGGESTED_SESSION_EVENT, {
    detail: { project, prompt },
  }));
};

/** The prompt queued for this project's new session, removed so it is sent once. */
export const takePendingSuggestedPrompt = (projectId: string | undefined): string | null => {
  if (!projectId) {
    return null;
  }
  const prompt = pendingPrompts.get(projectId) ?? null;
  pendingPrompts.delete(projectId);
  return prompt;
};
