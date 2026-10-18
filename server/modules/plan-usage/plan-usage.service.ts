import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { query } from '@anthropic-ai/claude-agent-sdk';

import { resolveClaudeCodeExecutablePath } from '@/shared/claude-cli-path.js';
import { AppError } from '@/shared/utils.js';
import {
  normalizeRateLimitInfo,
  parseUsageCommandOutput,
  type PlanUsageModelWindow,
  type PlanUsageWindows,
} from '@/modules/plan-usage/plan-usage.parser.js';

/**
 * Claude subscription usage (5-hour session window, weekly limits) for the
 * whole app. Two sources feed it: the `rate_limit_event` frames every Claude
 * turn streams, and the CLI's local `/usage` command, run on demand. `/usage`
 * never reaches the model, so a refresh costs no plan usage.
 */

export type PlanUsageState = {
  windows: PlanUsageWindows;
  status: string | null;
  isUsingOverage: boolean | null;
  /** ISO time of the last change from either source; null before the first. */
  updatedAt: string | null;
  source: 'stream' | 'usage-command' | null;
  /** The "What's contributing" block of the last `/usage`. */
  details: string | null;
  /** Why the last `/usage` refresh produced nothing, cleared by the next good one. */
  refreshError: string | null;
};

type PlanUsageServiceDependencies = {
  runUsageCommand: () => Promise<string>;
  broadcast: (state: PlanUsageState) => void;
  now: () => number;
};

const USAGE_COMMAND = '/usage';
const USAGE_COMMAND_TIMEOUT_MS = 20_000;
const MIN_REFRESH_INTERVAL_MS = 60_000;
/** Cached data older than this gets a background refresh when a client asks for it. */
export const PLAN_USAGE_STALE_AFTER_MS = 15 * 60_000;
const STARTUP_REFRESH_DELAY_MS = 10_000;

const emptyState = (): PlanUsageState => ({
  windows: {},
  status: null,
  isUsingOverage: null,
  updatedAt: null,
  source: null,
  details: null,
  refreshError: null,
});

function mergeModelWindows(
  current: PlanUsageModelWindow[] | undefined,
  incoming: PlanUsageModelWindow[] | undefined,
): PlanUsageModelWindow[] | undefined {
  if (!incoming?.length) {
    return current;
  }
  const incomingLabels = new Set(incoming.map((entry) => entry.label));
  return [...(current ?? []).filter((entry) => !incomingLabels.has(entry.label)), ...incoming];
}

/**
 * Runs `/usage` through the SDK in an isolated, throwaway session: no tools,
 * no MCP servers, no settings (so no hooks), nothing written to disk.
 */
async function runUsageCommandThroughSdk(): Promise<string> {
  const abortController = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, USAGE_COMMAND_TIMEOUT_MS);
  const executablePath = resolveClaudeCodeExecutablePath(process.env.CLAUDE_CLI_PATH);
  const queryInstance = query({
    prompt: USAGE_COMMAND,
    options: {
      cwd: os.homedir(),
      env: { ...process.env },
      ...(executablePath ? { pathToClaudeCodeExecutable: executablePath } : {}),
      persistSession: false,
      maxTurns: 1,
      tools: [],
      settingSources: [],
      strictMcpConfig: true,
      mcpServers: {},
      abortController,
    },
  });

  let assistantText = '';
  try {
    for await (const message of queryInstance) {
      if (message.type === 'assistant') {
        // A CLI without the local command would treat "/usage" as a prompt:
        // stop before that turns into real model usage.
        if (message.message?.model && message.message.model !== '<synthetic>') {
          abortController.abort();
          throw new Error('The Claude CLI sent /usage to the model instead of running it locally.');
        }
        const blocks = Array.isArray(message.message?.content) ? message.message.content : [];
        assistantText += blocks
          .map((block: { type?: string; text?: string }) => (block.type === 'text' ? block.text ?? '' : ''))
          .join('');
      }
      if (message.type === 'result') {
        return message.subtype === 'success' && message.result ? message.result : assistantText;
      }
    }
    return assistantText;
  } catch (error) {
    if (timedOut) {
      throw new Error('The /usage command timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

type WebSocketModule = typeof import('@/modules/websocket/index.js');
let websocketModule: Promise<WebSocketModule> | null = null;

function broadcastToClients(state: PlanUsageState): void {
  // Loaded on first use: a static import closes the cycle websocket →
  // providers → Claude runtime → plan usage, which leaves the runtime
  // uninitialized while its own module is still loading.
  websocketModule ??= import('@/modules/websocket/index.js');
  const payload = JSON.stringify({ kind: 'plan_usage', usage: state, timestamp: new Date().toISOString() });
  void websocketModule
    .then(({ connectedClients, WS_OPEN_STATE }) => {
      connectedClients.forEach((client) => {
        if (client.readyState === WS_OPEN_STATE) {
          client.send(payload);
        }
      });
    })
    .catch((error: Error) => console.warn('[Plan usage] Could not broadcast plan usage:', error.message));
}

export function createPlanUsageService(dependencies: Partial<PlanUsageServiceDependencies> = {}) {
  const deps: PlanUsageServiceDependencies = {
    runUsageCommand: runUsageCommandThroughSdk,
    broadcast: broadcastToClients,
    now: () => Date.now(),
    ...dependencies,
  };
  let state = emptyState();
  let storePath: string | null = null;
  let refreshInFlight: Promise<PlanUsageState> | null = null;
  let lastRefreshStartedAt = 0;
  let startupTimer: NodeJS.Timeout | null = null;

  const save = () => {
    if (!storePath) {
      return;
    }
    try {
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      fs.writeFileSync(storePath, JSON.stringify(state));
    } catch (error) {
      // Still known in memory; only a restart loses it.
      console.warn('[Plan usage] Could not save plan usage:', (error as Error).message);
    }
  };

  const commit = (next: PlanUsageState) => {
    state = next;
    save();
    deps.broadcast(state);
    return state;
  };

  const msSinceRefreshStart = () => deps.now() - lastRefreshStartedAt;

  const service = {
    /** Loads the state saved before the last restart and keeps saving to `filePath`; null = memory only. */
    initialize(filePath: string | null): void {
      storePath = filePath;
      state = emptyState();
      if (!filePath) {
        return;
      }
      try {
        const saved = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<PlanUsageState>;
        if (saved && typeof saved === 'object' && saved.windows && typeof saved.windows === 'object') {
          state = { ...emptyState(), ...saved };
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.warn('[Plan usage] Ignoring unreadable plan usage store:', (error as Error).message);
        }
      }
    },

    getState(): PlanUsageState {
      return state;
    },

    isStale(): boolean {
      return !state.updatedAt || deps.now() - Date.parse(state.updatedAt) > PLAN_USAGE_STALE_AFTER_MS;
    },

    /** Whether a refresh may start now (none running, the last one at least a minute ago). */
    canRefresh(): boolean {
      return !refreshInFlight && msSinceRefreshStart() >= MIN_REFRESH_INTERVAL_MS;
    },

    /** Applies the `rate_limit_info` of a stream `rate_limit_event`. */
    updateFromRateLimitInfo(info: unknown): void {
      const update = normalizeRateLimitInfo(info);
      if (!update) {
        return;
      }
      commit({
        ...state,
        windows: {
          fiveHour: update.windows.fiveHour ?? state.windows.fiveHour,
          sevenDay: update.windows.sevenDay ?? state.windows.sevenDay,
          perModel: mergeModelWindows(state.windows.perModel, update.windows.perModel),
        },
        status: update.status ?? state.status,
        isUsingOverage: update.isUsingOverage ?? state.isUsingOverage,
        updatedAt: new Date(deps.now()).toISOString(),
        source: 'stream',
      });
    },

    /** Runs `/usage` now. Rejects with 409 while one runs and 429 within a minute of the last. */
    async refresh(): Promise<PlanUsageState> {
      if (refreshInFlight) {
        throw new AppError('A plan usage refresh is already running.', { code: 'PLAN_USAGE_BUSY', statusCode: 409 });
      }
      if (msSinceRefreshStart() < MIN_REFRESH_INTERVAL_MS) {
        throw new AppError('Plan usage was refreshed less than a minute ago.', {
          code: 'PLAN_USAGE_TOO_SOON',
          statusCode: 429,
        });
      }
      lastRefreshStartedAt = deps.now();
      refreshInFlight = (async () => {
        try {
          const output = await deps.runUsageCommand();
          const parsed = parseUsageCommandOutput(output, deps.now());
          if (!parsed) {
            const firstLine = output.trim().split(/\r?\n/)[0]?.slice(0, 200);
            return commit({ ...state, refreshError: firstLine || 'The /usage command returned no usage.' });
          }
          return commit({
            ...state,
            windows: parsed.windows,
            details: parsed.details,
            updatedAt: new Date(deps.now()).toISOString(),
            source: 'usage-command',
            refreshError: null,
          });
        } catch (error) {
          return commit({ ...state, refreshError: error instanceof Error ? error.message : String(error) });
        } finally {
          refreshInFlight = null;
        }
      })();
      return refreshInFlight;
    },

    /** Starts a background refresh when the cache is stale and one is allowed. */
    refreshIfStale(): void {
      if (service.isStale() && service.canRefresh()) {
        void service.refresh().catch(() => undefined);
      }
    },

    scheduleStartupRefresh(delayMs: number = STARTUP_REFRESH_DELAY_MS): void {
      if (startupTimer) clearTimeout(startupTimer);
      startupTimer = setTimeout(() => {
        startupTimer = null;
        if (service.canRefresh()) {
          void service.refresh().catch(() => undefined);
        }
      }, delayMs);
      startupTimer.unref?.();
    },
  };
  return service;
}

export const planUsageService = createPlanUsageService();
