import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/shared/api';

export type GitChangedFile = {
  path: string;
  /** Null when git cannot count the file: binary, or untracked and too large. */
  added: number | null;
  deleted: number | null;
  status: 'modified' | 'untracked';
};

export type GitChangeSummary = {
  branch: string | null;
  files: GitChangedFile[];
  added: number;
  deleted: number;
};

type NumstatPayload = Partial<GitChangeSummary> & { error?: string };

// The working tree changes while the agent works and nothing pushes that to
// the browser, so the chip polls; slowly, as one call runs two git commands.
const POLL_INTERVAL_MS = 30_000;

/**
 * Used by WorkspaceMain: the project's branch and uncommitted line counts
 * against HEAD (staged, unstaged and untracked), from `/api/git/numstat`.
 * Null while unknown or when the project is not a git repository.
 */
export function useGitChangeSummary(projectId: string | null | undefined) {
  // Kept with the project it describes, so switching projects shows nothing
  // until the new answer arrives rather than the previous project's counts.
  const [result, setResult] = useState<{ projectId: string; summary: GitChangeSummary | null } | null>(null);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!projectId) {
      return;
    }
    const requestId = ++requestRef.current;
    let summary: GitChangeSummary | null = null;
    try {
      const response = await api.git.numstat(projectId);
      const payload = (await response.json()) as NumstatPayload;
      if (response.ok && !payload.error) {
        summary = {
          branch: payload.branch ?? null,
          files: Array.isArray(payload.files) ? payload.files : [],
          added: payload.added ?? 0,
          deleted: payload.deleted ?? 0,
        };
      }
    } catch (error) {
      console.warn('[workspace] Could not read git changes:', error);
    }
    // A slower answer for a previous request must not overwrite this one.
    if (requestId === requestRef.current) {
      setResult({ projectId, summary });
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };
    const timer = window.setInterval(refreshWhenVisible, POLL_INTERVAL_MS);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refresh]);

  const summary = result && result.projectId === projectId ? result.summary : null;
  return { summary, refresh };
}
