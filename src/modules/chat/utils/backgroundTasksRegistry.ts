import { useCallback, useSyncExternalStore } from 'react';

/** One running task as the strip, its panel and the workspace's Background pane draw it. */
export type BackgroundTaskItem = {
  key: string;
  kind: string;
  name: string;
  progress: string;
  /** Epoch ms the task launched; undefined when nothing says. */
  startedAt?: number;
  /** The `chat.stop-task` frame, or undefined when nothing has named the task. */
  stopFrame?: { type: 'chat.stop-task'; sessionId: string; taskId: string; toolUseId: string };
  /** Opens the task's row; undefined for a task no page of this transcript holds. */
  open?: () => void;
  /** Why clicking it does what it does, appended to the title. */
  hint?: string;
};

export type BackgroundTasksEntry = {
  items: BackgroundTaskItem[];
  sendMessage: (message: unknown) => void;
};

/*
 * The task list is worked out inside the chat, from rows only the transcript
 * holds; the workspace's Background pane lives outside it. The strip publishes
 * what it computed here, per session, and the pane reads it, so neither has
 * to lift the transcript state.
 */
const entries = new Map<string, BackgroundTasksEntry>();
const listeners = new Set<() => void>();

export function publishBackgroundTasks(sessionId: string, entry: BackgroundTasksEntry | null): void {
  if (entry && entry.items.length > 0) {
    entries.set(sessionId, entry);
  } else if (entries.has(sessionId)) {
    entries.delete(sessionId);
  } else {
    return;
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The running tasks the session's strip last published, or null when none run. */
export function useBackgroundTasksEntry(sessionId: string | null | undefined): BackgroundTasksEntry | null {
  const read = useCallback(() => (sessionId ? entries.get(sessionId) ?? null : null), [sessionId]);
  return useSyncExternalStore(subscribe, read, read);
}
