import { readUserPreference } from '@/shared/userSettings';

/**
 * The boolean UI preferences and their reducer, kept separate from the provider
 * so the state transitions are unit-testable without rendering anything.
 *
 * The values are stored in `auth.db` through the preference store, so a toggle
 * made on one device is in effect on the next.
 */

/** Toggles the user controls from Quick Settings and the Settings dialog. */
export type UiPreferences = {
  showRawParameters: boolean;
  showThinking: boolean;
  sendByCtrlEnter: boolean;
  sidebarVisible: boolean;
  voiceEnabled: boolean;
  promptSuggestions: boolean;
  /** Files an agent sends open in the central viewer when they arrive on screen. */
  autoOpenSentFiles: boolean;
};

export type UiPreferenceKey = keyof UiPreferences;

export type UiPreferencesAction =
  | { type: 'set'; key: UiPreferenceKey; value: unknown }
  | { type: 'set_many'; value?: Partial<Record<UiPreferenceKey, unknown>> };

const DEFAULTS: UiPreferences = {
  showRawParameters: false,
  showThinking: true,
  sendByCtrlEnter: false,
  sidebarVisible: true,
  voiceEnabled: false,
  promptSuggestions: true,
  autoOpenSentFiles: true,
};

const PREFERENCE_KEYS = Object.keys(DEFAULTS) as UiPreferenceKey[];
/** Prevents an unknown key from being written into the blob. */
const VALID_KEYS = new Set<UiPreferenceKey>(PREFERENCE_KEYS);

/** Values were historically stored as both real booleans and the strings. */
const parseBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }

  return fallback;
};

/**
 * Reads the stored preferences, filling in a default for anything the user has
 * never toggled. Synchronous, because the sidebar's visibility and the composer's
 * send-key are needed on the very first render.
 */
export const readStoredUiPreferences = (): UiPreferences => {
  const stored = readUserPreference<Record<string, unknown>>('uiPreferences', {});

  return PREFERENCE_KEYS.reduce((acc, key) => {
    acc[key] = parseBoolean(stored[key], DEFAULTS[key]);
    return acc;
  }, { ...DEFAULTS });
};

export function uiPreferencesReducer(
  state: UiPreferences,
  action: UiPreferencesAction,
): UiPreferences {
  switch (action.type) {
    case 'set': {
      const { key, value } = action;
      if (!VALID_KEYS.has(key)) {
        return state;
      }

      const nextValue = parseBoolean(value, state[key]);
      // Returning the same object keeps consumers from re-rendering on a no-op.
      return state[key] === nextValue ? state : { ...state, [key]: nextValue };
    }
    case 'set_many': {
      const updates = action.value || {};
      let changed = false;
      const nextState = { ...state };

      for (const key of PREFERENCE_KEYS) {
        if (!(key in updates)) continue;

        const nextValue = parseBoolean(updates[key], state[key]);
        if (nextState[key] !== nextValue) {
          nextState[key] = nextValue;
          changed = true;
        }
      }

      return changed ? nextState : state;
    }
    default:
      return state;
  }
}

/**
 * How much of the agent's work the transcript shows, cycled like Claude Code's
 * Ctrl+O: `normal` = prose and collapsed tool summaries, `thinking` = also the
 * reasoning blocks, `verbose` = every tool call expanded with its raw input.
 *
 * Stored as the two booleans it replaced (showThinking, showRawParameters) so
 * preferences saved by older builds keep their meaning and sync unchanged.
 */
export type TranscriptViewMode = 'normal' | 'thinking' | 'verbose';

export const TRANSCRIPT_VIEW_MODES: TranscriptViewMode[] = ['normal', 'thinking', 'verbose'];

/** Raw parameters on wins: an old "raw on, thinking off" combination reads as verbose. */
export function getTranscriptViewMode(
  preferences: Pick<UiPreferences, 'showThinking' | 'showRawParameters'>,
): TranscriptViewMode {
  if (preferences.showRawParameters) return 'verbose';
  return preferences.showThinking ? 'thinking' : 'normal';
}

export function getTranscriptViewModePreferences(
  mode: TranscriptViewMode,
): Pick<UiPreferences, 'showThinking' | 'showRawParameters'> {
  return {
    showThinking: mode !== 'normal',
    showRawParameters: mode === 'verbose',
  };
}

export function getNextTranscriptViewMode(mode: TranscriptViewMode): TranscriptViewMode {
  const index = TRANSCRIPT_VIEW_MODES.indexOf(mode);
  return TRANSCRIPT_VIEW_MODES[(index + 1) % TRANSCRIPT_VIEW_MODES.length];
}
