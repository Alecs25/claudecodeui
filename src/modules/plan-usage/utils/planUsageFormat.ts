/** Amber from 70%, red from 90%: the same thresholds as the context ring. */
export function planUsageColorClass(utilization: number): { text: string; bar: string } {
  if (utilization >= 0.9) return { text: 'text-red-500', bar: 'bg-red-500' };
  if (utilization >= 0.7) return { text: 'text-amber-500', bar: 'bg-amber-500' };
  return { text: 'text-muted-foreground', bar: 'bg-primary' };
}

export const toPercent = (utilization: number) => Math.round(Math.min(1, Math.max(0, utilization)) * 100);

const isSameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * The reset time in the browser's locale and timezone: just the time when it
 * is today ("14:10"), otherwise weekday, day and time ("mer 22, 11:00").
 */
export function formatResetTime(resetsAt: number, now: number = Date.now(), locale?: string): { isToday: boolean; text: string } {
  const date = new Date(resetsAt);
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
  if (isSameLocalDay(date, new Date(now))) {
    return { isToday: true, text: time };
  }
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric' }).format(date);
  return { isToday: false, text: `${day}, ${time}` };
}

/** Whole minutes since `isoTime`, never negative. */
export const minutesSince = (isoTime: string, now: number = Date.now()) =>
  Math.max(0, Math.floor((now - Date.parse(isoTime)) / 60_000));
