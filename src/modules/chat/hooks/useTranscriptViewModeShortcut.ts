import { useEffect, useRef } from 'react';

import { getNextTranscriptViewMode, type TranscriptViewMode } from '@/shared/uiPreferences';

/** Ctrl+O, as in Claude Code; Ctrl only, since Cmd+O is the browser's own Open on macOS. */
export function isTranscriptViewModeShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): boolean {
  return event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'o';
}

/**
 * Used by ChatInterface: cycles Normal → Thinking → Verbose on Ctrl+O while the
 * chat tab is the one showing. Works from the composer too, where Ctrl+O has no
 * other meaning.
 */
export function useTranscriptViewModeShortcut(
  isActive: boolean,
  mode: TranscriptViewMode | undefined,
  onChange: ((mode: TranscriptViewMode) => void) | undefined,
): void {
  // Read through a ref so the listener is not re-attached on every mode change.
  const latest = useRef({ mode, onChange });
  useEffect(() => {
    latest.current = { mode, onChange };
  }, [mode, onChange]);

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const { mode: current, onChange: change } = latest.current;
      if (!current || !change || event.defaultPrevented || !isTranscriptViewModeShortcut(event)) {
        return;
      }
      event.preventDefault();
      change(getNextTranscriptViewMode(current));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);
}
