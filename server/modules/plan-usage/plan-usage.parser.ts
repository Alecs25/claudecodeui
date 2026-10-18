/**
 * Turns the two places Claude Code reports plan usage into one shape: the
 * `rate_limit_event` frames of a running turn and the text of the CLI's
 * local `/usage` command.
 */

export type PlanUsageWindow = {
  /** Share of the window used, 0–1. */
  utilization: number;
  /** Unix epoch milliseconds, or null when the reset time could not be read. */
  resetsAt: number | null;
  /** The reset as the CLI wrote it, kept when it could not be turned into a time. */
  resetsText?: string;
};

export type PlanUsageModelWindow = PlanUsageWindow & { label: string };

export type PlanUsageWindows = {
  fiveHour?: PlanUsageWindow;
  sevenDay?: PlanUsageWindow;
  perModel?: PlanUsageModelWindow[];
};

export type ParsedUsageCommand = {
  windows: PlanUsageWindows;
  /** The "What's contributing to your limits usage?" block, as plain text. */
  details: string | null;
};

export type RateLimitUpdate = {
  windows: PlanUsageWindows;
  status: string | null;
  isUsingOverage: boolean | null;
};

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const USAGE_LINE_PATTERN =
  /^\s*Current (session|week)(?:\s*\(([^)]+)\))?\s*:\s*(\d+(?:\.\d+)?)\s*%\s*used(?:\s*[·•|,\-–—]\s*resets?\s+(.+?))?\s*$/i;
const DETAILS_HEADING_PATTERN = /^\s*What(?:'|’)s contributing/i;
// "Oct 22, 11am", "Oct 18, 2:10pm", "Oct 18 at 14:10", "2:10pm", "11am", "14:10"
const RESET_PATTERN =
  /^(?:([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i;
const RESET_IN_PATTERN = /^in\s+(?:(\d+)\s*d(?:ays?)?\s*)?(?:(\d+)\s*h(?:ours?|rs?)?\s*)?(?:(\d+)\s*m(?:in(?:utes?)?)?)?$/i;

const clampUtilization = (value: number) => Math.min(1, Math.max(0, value));

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Offset of `timeZone` from UTC at `utcMs`, in milliseconds (positive east of Greenwich). */
function timeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(utcMs));
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour') % 24, read('minute'), read('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The instant a wall-clock time in `timeZone` names. The second pass settles DST edges. */
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): number {
  const wallClockAsUtc = Date.UTC(year, month, day, hour, minute);
  const firstGuess = wallClockAsUtc - timeZoneOffsetMs(wallClockAsUtc, timeZone);
  return wallClockAsUtc - timeZoneOffsetMs(firstGuess, timeZone);
}

/** The calendar date `utcMs` falls on in `timeZone`. */
function zonedDate(utcMs: number, timeZone: string): { year: number; month: number; day: number } {
  const shifted = new Date(utcMs + timeZoneOffsetMs(utcMs, timeZone));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the reset part of a `/usage` line ("Oct 22, 11am (Europe/Rome)").
 * The CLI prints neither the year nor, for today, the date, and a reset is
 * always ahead: a time already past means the next day or year. Returns null
 * for a format it does not know.
 */
export function parseResetText(text: string, now: number = Date.now()): number | null {
  const zoneMatch = /\(([^)]+)\)\s*$/.exec(text);
  const candidateZone = zoneMatch?.[1]?.trim();
  const timeZone = candidateZone && isValidTimeZone(candidateZone)
    ? candidateZone
    : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const body = (zoneMatch ? text.slice(0, zoneMatch.index) : text).trim();

  const relative = RESET_IN_PATTERN.exec(body);
  if (relative && (relative[1] || relative[2] || relative[3])) {
    const [days, hours, minutes] = [relative[1], relative[2], relative[3]].map((value) => Number(value ?? 0));
    return now + ((days * 24 + hours) * 60 + minutes) * MINUTE_MS;
  }

  const match = RESET_PATTERN.exec(body);
  if (!match) {
    return null;
  }
  const [, monthName, dayText, hourText, minuteText, meridiem] = match;
  let hour = Number(hourText);
  const minute = Number(minuteText ?? 0);
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem.toLowerCase() === 'pm' ? 12 : 0);
  }
  if (hour > 23 || minute > 59) {
    return null;
  }

  const today = zonedDate(now, timeZone);
  if (!monthName) {
    const sameDay = zonedTimeToUtc(today.year, today.month, today.day, hour, minute, timeZone);
    return sameDay >= now - MINUTE_MS
      ? sameDay
      : zonedTimeToUtc(today.year, today.month, today.day + 1, hour, minute, timeZone);
  }

  const month = MONTHS[monthName.toLowerCase()];
  const day = Number(dayText);
  if (month === undefined || day < 1 || day > 31) {
    return null;
  }
  const thisYear = zonedTimeToUtc(today.year, month, day, hour, minute, timeZone);
  return thisYear >= now - DAY_MS ? thisYear : zonedTimeToUtc(today.year + 1, month, day, hour, minute, timeZone);
}

function toWindow(percentText: string, resetText: string | undefined, now: number): PlanUsageWindow {
  const window: PlanUsageWindow = {
    utilization: clampUtilization(Number(percentText) / 100),
    resetsAt: null,
  };
  if (!resetText) {
    return window;
  }
  window.resetsAt = parseResetText(resetText, now);
  if (window.resetsAt === null) {
    window.resetsText = resetText.trim();
  }
  return window;
}

/**
 * Parses the text of `/usage`. Returns null when it holds no usage line at
 * all, e.g. an API-key login, where the command reports something else.
 */
export function parseUsageCommandOutput(text: string, now: number = Date.now()): ParsedUsageCommand | null {
  const windows: PlanUsageWindows = {};
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let detailsStart = -1;

  lines.forEach((line, index) => {
    if (detailsStart < 0 && DETAILS_HEADING_PATTERN.test(line)) {
      detailsStart = index;
      return;
    }
    const match = USAGE_LINE_PATTERN.exec(line);
    if (!match) {
      return;
    }
    const [, kind, label, percent, reset] = match;
    const window = toWindow(percent, reset, now);
    if (kind.toLowerCase() === 'session') {
      windows.fiveHour = window;
    } else if (!label || /^all models$/i.test(label.trim())) {
      windows.sevenDay = window;
    } else {
      windows.perModel = [...(windows.perModel ?? []), { label: label.trim(), ...window }];
    }
  });

  if (!windows.fiveHour && !windows.sevenDay && !windows.perModel) {
    return null;
  }
  const details = detailsStart >= 0 ? lines.slice(detailsStart).join('\n').trim() : '';
  return { windows, details: details || null };
}

/** "seven_day_opus" → "Opus". */
function modelLabelFromWindowKey(key: string): string {
  const name = key.replace(/^seven_day_?/i, '').replace(/_/g, ' ').trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : key;
}

function streamWindow(raw: unknown): PlanUsageWindow | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const { utilization, resetsAt } = raw as Record<string, unknown>;
  if (!isFiniteNumber(utilization)) {
    return null;
  }
  return {
    utilization: clampUtilization(utilization),
    // The SDK reports unix seconds.
    resetsAt: isFiniteNumber(resetsAt) ? resetsAt * 1000 : null,
  };
}

function assignWindow(windows: PlanUsageWindows, key: string, window: PlanUsageWindow): void {
  if (key === 'five_hour') {
    windows.fiveHour = window;
  } else if (key === 'seven_day') {
    windows.sevenDay = window;
  } else if (key.startsWith('seven_day_')) {
    const label = modelLabelFromWindowKey(key);
    windows.perModel = [...(windows.perModel ?? []).filter((entry) => entry.label !== label), { label, ...window }];
  }
}

/**
 * Normalizes the `rate_limit_info` of a stream `rate_limit_event`. The CLI
 * sends every window in `unifiedWindows` (not in the SDK typings); the typed
 * shape carries a single window named by `rateLimitType`, which only fills a
 * window `unifiedWindows` left out.
 */
export function normalizeRateLimitInfo(info: unknown): RateLimitUpdate | null {
  if (!info || typeof info !== 'object') {
    return null;
  }
  const record = info as Record<string, unknown>;
  const windows: PlanUsageWindows = {};

  if (record.unifiedWindows && typeof record.unifiedWindows === 'object') {
    for (const [key, raw] of Object.entries(record.unifiedWindows as Record<string, unknown>)) {
      const window = streamWindow(raw);
      if (window) assignWindow(windows, key, window);
    }
  }

  const singleKey = typeof record.rateLimitType === 'string' ? record.rateLimitType : null;
  const singleWindow = singleKey ? streamWindow(record) : null;
  const unifiedHasIt = singleKey !== null
    && record.unifiedWindows !== null
    && typeof record.unifiedWindows === 'object'
    && singleKey in (record.unifiedWindows as Record<string, unknown>);
  if (singleKey && singleWindow && !unifiedHasIt) {
    assignWindow(windows, singleKey, singleWindow);
  }

  return {
    windows,
    status: typeof record.status === 'string' ? record.status : null,
    isUsingOverage: typeof record.isUsingOverage === 'boolean' ? record.isUsingOverage : null,
  };
}
