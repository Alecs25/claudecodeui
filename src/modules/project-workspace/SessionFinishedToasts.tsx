import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, X } from 'lucide-react';
import type { NavigateFunction } from 'react-router-dom';

import { useWebSocket } from '@/shared/context/WebSocketContext';
import type { ServerEvent } from '@/shared/types';

type FinishedSessionToast = {
  sessionId: string;
  title: string;
};

/** How long a toast stays up on its own. The unread dot keeps the signal after it goes. */
const TOAST_DURATION_MS = 8000;
/** Older toasts give way beyond this many, so a burst of finishes cannot cover the page. */
const MAX_VISIBLE_TOASTS = 3;

/**
 * Rendered by ProjectWorkspaceShell: a toast for each session whose run ended
 * while no tab was showing it, with a button that opens the session.
 *
 * It reacts to the server's `session_status` frame marked `finishedUnseen`, so
 * "not viewing" is decided once, server-side, for every tab alike; `notify` is
 * false when the user turned off "run stopped" notifications in Settings.
 */
function SessionFinishedToasts({ navigate }: { navigate: NavigateFunction }) {
  const { t } = useTranslation('sidebar');
  const { subscribe } = useWebSocket();
  const [toasts, setToasts] = useState<FinishedSessionToast[]>([]);
  const timersRef = useRef(new Map<string, number>());

  const dismiss = useCallback((sessionId: string) => {
    const timer = timersRef.current.get(sessionId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(sessionId);
    }
    setToasts((previous) => previous.filter((toast) => toast.sessionId !== sessionId));
  }, []);

  useEffect(() => subscribe((event: ServerEvent) => {
    if (event.kind !== 'session_status' || event.finishedUnseen !== true || event.notify === false) {
      return;
    }
    if (typeof event.sessionId !== 'string' || !event.sessionId) {
      return;
    }
    const sessionId = event.sessionId;
    const title = typeof event.sessionTitle === 'string' && event.sessionTitle.trim()
      ? event.sessionTitle.trim()
      : t('sessionFinished.untitled', { defaultValue: 'Session' });

    setToasts((previous) => [
      ...previous.filter((toast) => toast.sessionId !== sessionId),
      { sessionId, title },
    ].slice(-MAX_VISIBLE_TOASTS));

    const existingTimer = timersRef.current.get(sessionId);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
    }
    timersRef.current.set(sessionId, window.setTimeout(() => dismiss(sessionId), TOAST_DURATION_MS));
  }), [dismiss, subscribe, t]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(320px,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.sessionId}
          role="status"
          data-testid="session-finished-toast"
          className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-lg"
        >
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground" title={toast.title}>{toast.title}</p>
            <p className="text-[11px] text-muted-foreground">
              {t('sessionFinished.message', { defaultValue: 'Finished' })}
            </p>
          </div>
          <button
            type="button"
            className="flex-shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
            onClick={() => {
              dismiss(toast.sessionId);
              navigate(`/session/${toast.sessionId}`);
            }}
          >
            {t('sessionFinished.open', { defaultValue: 'Open' })}
          </button>
          <button
            type="button"
            aria-label={t('sessionFinished.dismiss', { defaultValue: 'Dismiss' })}
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            onClick={() => dismiss(toast.sessionId)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export default memo(SessionFinishedToasts);
