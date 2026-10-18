import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCwIcon } from 'lucide-react';

import { cn } from '@/shared/utils';
import { usePlanUsage } from '@/modules/plan-usage/hooks/usePlanUsage';
import type { PlanUsageWindow } from '@/modules/plan-usage/types';
import {
  formatResetTime,
  minutesSince,
  planUsageColorClass,
  toPercent,
} from '@/modules/plan-usage/utils/planUsageFormat';

type PlanUsageSectionProps = {
  className?: string;
};

const CLOCK_TICK_MS = 30_000;

/** Re-renders now and then so "updated N min ago" and "today" stay true while open. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function UsageRow({ label, window, now }: { label: string; window: PlanUsageWindow; now: number }) {
  const { t } = useTranslation();
  const percent = toPercent(window.utilization);
  const colors = planUsageColorClass(window.utilization);
  let resetLabel: string | null = null;
  if (window.resetsAt !== null) {
    const reset = formatResetTime(window.resetsAt, now);
    resetLabel = reset.isToday
      ? t('common:planUsage.resetsToday', { time: reset.text, defaultValue: 'resets at {{time}}' })
      : t('common:planUsage.resetsOn', { date: reset.text, defaultValue: 'resets {{date}}' });
  } else if (window.resetsText) {
    resetLabel = t('common:planUsage.resetsOn', { date: window.resetsText, defaultValue: 'resets {{date}}' });
  }

  return (
    <div className="space-y-1" data-testid="plan-usage-row">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className={cn('font-medium tabular-nums', colors.text)}>{percent}%</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/20"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className={cn('h-full rounded-full', colors.bar)} style={{ width: `${percent}%` }} />
      </div>
      {resetLabel && <div className="text-[11px] text-muted-foreground">{resetLabel}</div>}
    </div>
  );
}

/**
 * Claude plan usage: the 5-hour session window, the weekly limit and any
 * per-model weekly limits, with a manual refresh (the CLI's local /usage) and
 * the CLI's own notes on what is using the limits. Self-contained, so it can
 * sit in the context ring popover and in Settings alike.
 */
export default function PlanUsageSection({ className }: PlanUsageSectionProps) {
  const { t } = useTranslation();
  const { usage, isRefreshing, refresh } = usePlanUsage();
  const now = useNow();
  const windows = usage?.windows ?? {};
  const hasData = Boolean(windows.fiveHour || windows.sevenDay || windows.perModel?.length);

  let updatedLabel: string | null = null;
  if (usage?.updatedAt) {
    const minutes = minutesSince(usage.updatedAt, now);
    updatedLabel = minutes < 1
      ? t('common:planUsage.updatedNow', { defaultValue: 'updated just now' })
      : t('common:planUsage.updatedAgo', { minutes, defaultValue: 'updated {{minutes}} min ago' });
  }

  return (
    <div className={cn('space-y-2', className)} data-testid="plan-usage-section">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {t('common:planUsage.title', { defaultValue: 'Plan' })}
      </div>

      {windows.fiveHour && (
        <UsageRow label={t('common:planUsage.session', { defaultValue: 'Session (5 hours)' })} window={windows.fiveHour} now={now} />
      )}
      {windows.sevenDay && (
        <UsageRow label={t('common:planUsage.week', { defaultValue: 'Week' })} window={windows.sevenDay} now={now} />
      )}
      {windows.perModel?.map((entry) => (
        <UsageRow
          key={entry.label}
          label={t('common:planUsage.weekModel', { model: entry.label, defaultValue: 'Week ({{model}})' })}
          window={entry}
          now={now}
        />
      ))}
      {!hasData && (
        <div className="text-xs text-muted-foreground">
          {t('common:planUsage.noData', { defaultValue: 'No data yet' })}
        </div>
      )}
      {usage?.refreshError && (
        <div className="text-[11px] text-red-600 dark:text-red-400">{usage.refreshError}</div>
      )}

      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{updatedLabel}</span>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={isRefreshing}
          aria-label={t('common:planUsage.refresh', { defaultValue: 'Refresh' })}
          title={t('common:planUsage.refresh', { defaultValue: 'Refresh' })}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <RefreshCwIcon className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
        </button>
      </div>

      {usage?.details && (
        <details className="text-[11px] text-muted-foreground">
          <summary className="cursor-pointer select-none font-medium hover:text-foreground">
            {t('common:planUsage.details', { defaultValue: 'Details' })}
          </summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans">{usage.details}</pre>
        </details>
      )}
    </div>
  );
}
