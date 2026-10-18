import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import express from 'express';

import {
  normalizeRateLimitInfo,
  parseResetText,
  parseUsageCommandOutput,
} from '@/modules/plan-usage/plan-usage.parser.js';
import { createPlanUsageRouter } from '@/modules/plan-usage/plan-usage.routes.js';
import { createPlanUsageService, type PlanUsageState } from '@/modules/plan-usage/plan-usage.service.js';
import { AppError } from '@/shared/utils.js';

// 2026-10-18 10:00 in Rome (UTC+2, summer time).
const NOW = Date.UTC(2026, 9, 18, 8, 0);

const USAGE_OUTPUT = [
  'You are currently using your subscription to power your Claude Code usage',
  '',
  'Current session: 15% used · resets Oct 18, 2:10pm (Europe/Rome)',
  'Current week (all models): 29% used · resets Oct 22, 11am (Europe/Rome)',
  'Current week (Fable): 0% used · resets Oct 22, 11am (Europe/Rome)',
  '',
  "What's contributing to your limits usage?",
  'Approximate, based on local sessions on this machine.',
  '',
  'Last 24h · 1523 requests · 4 sessions',
  '  92% of your usage was at >150k context',
].join('\n');

test('parses the session, weekly and per-model lines of /usage', () => {
  const parsed = parseUsageCommandOutput(USAGE_OUTPUT, NOW);
  assert.ok(parsed);
  assert.deepEqual(parsed.windows.fiveHour, { utilization: 0.15, resetsAt: Date.UTC(2026, 9, 18, 12, 10) });
  assert.deepEqual(parsed.windows.sevenDay, { utilization: 0.29, resetsAt: Date.UTC(2026, 9, 22, 9, 0) });
  assert.deepEqual(parsed.windows.perModel, [{ label: 'Fable', utilization: 0, resetsAt: Date.UTC(2026, 9, 22, 9, 0) }]);
  assert.ok(parsed.details?.startsWith("What's contributing"));
  assert.ok(parsed.details?.includes('92% of your usage'));
});

test('parses /usage without a per-model line, with CRLF and a time-only reset', () => {
  const parsed = parseUsageCommandOutput(
    'Current session: 40% used · resets 2:10pm (Europe/Rome)\r\nCurrent week (all models): 7% used · resets Oct 22, 11am (Europe/Rome)\r\n',
    NOW,
  );
  assert.ok(parsed);
  assert.equal(parsed.windows.fiveHour?.resetsAt, Date.UTC(2026, 9, 18, 12, 10));
  assert.equal(parsed.windows.perModel, undefined);
  assert.equal(parsed.details, null);
});

test('keeps the reset text when it cannot be read and returns null without usage lines', () => {
  const parsed = parseUsageCommandOutput('Current session: 3% used · resets soon-ish', NOW);
  assert.deepEqual(parsed?.windows.fiveHour, { utilization: 0.03, resetsAt: null, resetsText: 'soon-ish' });
  assert.equal(parseUsageCommandOutput('/usage is only available for subscription plans.', NOW), null);
});

test('reads reset times as the next occurrence', () => {
  // 9am Rome is already past at 10am: tomorrow.
  assert.equal(parseResetText('9am (Europe/Rome)', NOW), Date.UTC(2026, 9, 19, 7, 0));
  // A 24-hour clock, and a date past this year rolls into the next.
  assert.equal(parseResetText('Jan 2, 14:30 (Europe/Rome)', NOW), Date.UTC(2027, 0, 2, 13, 30));
  // Winter time after the DST change.
  assert.equal(parseResetText('Nov 2, 11am (Europe/Rome)', NOW), Date.UTC(2026, 10, 2, 10, 0));
  assert.equal(parseResetText('in 2h 30m', NOW), NOW + 150 * 60_000);
  assert.equal(parseResetText('13pm (Europe/Rome)', NOW), null);
});

test('normalizes rate_limit_event payloads with unifiedWindows', () => {
  const update = normalizeRateLimitInfo({
    status: 'allowed',
    resetsAt: 1792325400,
    rateLimitType: 'five_hour',
    overageStatus: 'rejected',
    isUsingOverage: false,
    unifiedWindows: {
      five_hour: { utilization: 0.14, resetsAt: 1792325400 },
      seven_day: { utilization: 0.28, resetsAt: 1792659600 },
      seven_day_opus: { utilization: 0.5, resetsAt: 1792659600 },
    },
  });
  assert.deepEqual(update, {
    windows: {
      fiveHour: { utilization: 0.14, resetsAt: 1792325400_000 },
      sevenDay: { utilization: 0.28, resetsAt: 1792659600_000 },
      perModel: [{ label: 'Opus', utilization: 0.5, resetsAt: 1792659600_000 }],
    },
    status: 'allowed',
    isUsingOverage: false,
  });
});

test('normalizes the typed single-window payload, and ignores one without utilization', () => {
  assert.deepEqual(
    normalizeRateLimitInfo({ status: 'allowed_warning', rateLimitType: 'seven_day', utilization: 0.8, resetsAt: 100 })?.windows,
    { sevenDay: { utilization: 0.8, resetsAt: 100_000 } },
  );
  assert.deepEqual(normalizeRateLimitInfo({ status: 'allowed', rateLimitType: 'five_hour', resetsAt: 100 })?.windows, {});
  assert.equal(normalizeRateLimitInfo(null), null);
});

function createTestService(runUsageCommand: () => Promise<string>) {
  const broadcasts: PlanUsageState[] = [];
  let now = NOW;
  const service = createPlanUsageService({
    runUsageCommand,
    broadcast: (state) => broadcasts.push(state),
    now: () => now,
  });
  service.initialize(null);
  return { service, broadcasts, advance: (ms: number) => { now += ms; } };
}

test('merges stream updates into the /usage state and broadcasts each change', async () => {
  const { service, broadcasts } = createTestService(async () => USAGE_OUTPUT);
  await service.refresh();
  service.updateFromRateLimitInfo({ status: 'allowed', unifiedWindows: { five_hour: { utilization: 0.2, resetsAt: 1 } } });

  const state = service.getState();
  assert.equal(state.source, 'stream');
  assert.equal(state.windows.fiveHour?.utilization, 0.2);
  assert.equal(state.windows.sevenDay?.utilization, 0.29);
  assert.equal(state.windows.perModel?.[0]?.label, 'Fable');
  assert.ok(state.details);
  assert.equal(broadcasts.length, 2);
});

test('rate-limits /usage refreshes: 409 while running, 429 within a minute', async () => {
  let release: (text: string) => void = () => undefined;
  const { service, advance } = createTestService(() => new Promise<string>((resolve) => { release = resolve; }));

  const first = service.refresh();
  await assert.rejects(service.refresh(), (error: AppError) => error.statusCode === 409);
  release(USAGE_OUTPUT);
  await first;
  await assert.rejects(service.refresh(), (error: AppError) => error.statusCode === 429);
  advance(60_000);
  assert.equal(service.canRefresh(), true);
});

test('records a failed refresh without losing the cached windows', async () => {
  let fail = false;
  const { service, advance } = createTestService(async () => {
    if (fail) throw new Error('The /usage command timed out.');
    return USAGE_OUTPUT;
  });
  await service.refresh();
  fail = true;
  advance(60_000);
  const state = await service.refresh();
  assert.equal(state.refreshError, 'The /usage command timed out.');
  assert.equal(state.windows.fiveHour?.utilization, 0.15);
});

test('persists the state next to the database and loads it back', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'plan-usage-'));
  try {
    const filePath = path.join(directory, 'plan-usage.json');
    const { service } = createTestService(async () => USAGE_OUTPUT);
    service.initialize(filePath);
    await service.refresh();
    assert.equal(JSON.parse(await readFile(filePath, 'utf8')).windows.fiveHour.utilization, 0.15);

    const reloaded = createPlanUsageService({ broadcast: () => undefined });
    reloaded.initialize(filePath);
    assert.equal(reloaded.getState().windows.sevenDay?.utilization, 0.29);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function withServer(router: express.Router, run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use('/api/plan-usage', router);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error instanceof AppError ? error.statusCode : 500).json({ success: false });
  });
  const server = app.listen(0);
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/plan-usage`);
  } finally {
    server.close();
  }
}

test('routes: GET returns the cache and refreshes it when stale, POST refresh is rate-limited', async () => {
  let runs = 0;
  const { service } = createTestService(async () => {
    runs += 1;
    return USAGE_OUTPUT;
  });

  await withServer(createPlanUsageRouter(service), async (baseUrl) => {
    const initial = await fetch(baseUrl).then((response) => response.json()) as { success: boolean; data: PlanUsageState };
    assert.equal(initial.success, true);
    assert.equal(initial.data.updatedAt, null);
    // The stale (empty) cache started a background refresh.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(runs, 1);

    const tooSoon = await fetch(`${baseUrl}/refresh`, { method: 'POST' });
    assert.equal(tooSoon.status, 429);

    const cached = await fetch(baseUrl).then((response) => response.json()) as { data: PlanUsageState };
    assert.equal(cached.data.windows.fiveHour?.utilization, 0.15);
    assert.equal(runs, 1);
  });
});
