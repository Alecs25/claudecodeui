import { useCallback, useContext, useEffect, useSyncExternalStore } from 'react';

import { api } from '@/shared/api';
import WebSocketContext from '@/shared/context/WebSocketContext';
import type { PlanUsageState } from '@/modules/plan-usage/types';

/**
 * Plan usage is one app-wide value shown in several places (composer ring,
 * its popover, Settings), so it lives in a module store: one fetch, and one
 * `plan_usage` websocket event updates every view.
 */

type PlanUsageSnapshot = {
  usage: PlanUsageState | null;
  isRefreshing: boolean;
};

/** Older than this, opening a view asks the server again (which refreshes its own stale cache). */
const STALE_AFTER_MS = 15 * 60_000;
/** Spacing between client fetches, so several views mounting together fetch once. */
const MIN_FETCH_INTERVAL_MS = 60_000;

let snapshot: PlanUsageSnapshot = { usage: null, isRefreshing: false };
let lastFetchAt = 0;
const listeners = new Set<() => void>();

function setSnapshot(next: Partial<PlanUsageSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((listener) => listener());
}

function subscribeStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => snapshot;

function isPlanUsageState(value: unknown): value is PlanUsageState {
  return Boolean(value) && typeof value === 'object' && typeof (value as PlanUsageState).windows === 'object';
}

async function readUsage(response: Response): Promise<PlanUsageState | null> {
  if (!response.ok) {
    return null;
  }
  const body = await response.json() as { data?: unknown };
  return isPlanUsageState(body?.data) ? body.data : null;
}

function isStale(usage: PlanUsageState | null): boolean {
  return !usage?.updatedAt || Date.now() - Date.parse(usage.updatedAt) > STALE_AFTER_MS;
}

async function fetchPlanUsage(): Promise<void> {
  lastFetchAt = Date.now();
  try {
    const usage = await readUsage(await api.planUsage.get());
    if (usage) setSnapshot({ usage });
  } catch {
    // Offline or signed out: the section shows what it already has.
  }
}

async function refreshPlanUsage(): Promise<void> {
  if (snapshot.isRefreshing) {
    return;
  }
  setSnapshot({ isRefreshing: true });
  try {
    // 409/429 (busy, too soon) leave the current value; the server broadcasts
    // the result of the refresh that is running anyway.
    const usage = await readUsage(await api.planUsage.refresh());
    if (usage) setSnapshot({ usage });
  } catch {
    // Same as above.
  } finally {
    setSnapshot({ isRefreshing: false });
  }
}

/** For tests: forget the cached value. */
export function resetPlanUsageStore(): void {
  snapshot = { usage: null, isRefreshing: false };
  lastFetchAt = 0;
}

export function usePlanUsage() {
  const current = useSyncExternalStore(subscribeStore, getSnapshot, getSnapshot);
  // Optional on purpose: the ring and Settings also render in tests and
  // screens without the socket provider; they then just miss live updates.
  const subscribeSocket = useContext(WebSocketContext)?.subscribe;

  useEffect(() => {
    if (isStale(snapshot.usage) && Date.now() - lastFetchAt >= MIN_FETCH_INTERVAL_MS) {
      void fetchPlanUsage();
    }
  }, []);

  useEffect(() => subscribeSocket?.((event) => {
    if (event.kind === 'plan_usage' && isPlanUsageState(event.usage)) {
      setSnapshot({ usage: event.usage });
    }
  }), [subscribeSocket]);

  const refresh = useCallback(() => refreshPlanUsage(), []);
  return { usage: current.usage, isRefreshing: current.isRefreshing, refresh };
}
