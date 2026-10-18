import { useEffect, useRef } from 'react';

import type { AppTab } from '@/shared/types';

type ShortcutEvent = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

/**
 * The pane a keyboard shortcut toggles, or null: Ctrl+Shift+D for Changes,
 * Ctrl+` for the terminal, as in VS Code. Ctrl only, never Cmd, which the
 * browser and macOS keep for themselves.
 */
export function readPaneShortcut(event: ShortcutEvent): AppTab | null {
  if (!event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }
  if (event.shiftKey && event.key.toLowerCase() === 'd') {
    return 'diff';
  }
  // `code` as well: on layouts without a backtick key (Italian among them)
  // the key in that position sends another character.
  if (!event.shiftKey && (event.key === '`' || event.code === 'Backquote')) {
    return 'shell';
  }
  return null;
}

/** Used by WorkspaceMain to toggle panes from the keyboard while a project is open. */
export function usePaneShortcuts(isEnabled: boolean, onTogglePane: (pane: AppTab) => void): void {
  // Read through a ref so the listener is not re-attached whenever the open pane changes.
  const toggleRef = useRef(onTogglePane);
  useEffect(() => {
    toggleRef.current = onTogglePane;
  }, [onTogglePane]);

  useEffect(() => {
    if (!isEnabled) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const pane = event.defaultPrevented ? null : readPaneShortcut(event);
      if (!pane) {
        return;
      }
      event.preventDefault();
      toggleRef.current(pane);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEnabled]);
}
