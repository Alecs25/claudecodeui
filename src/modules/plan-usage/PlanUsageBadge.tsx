import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/utils';
import { usePlanUsage } from '@/modules/plan-usage/hooks/usePlanUsage';
import { planUsageColorClass, toPercent } from '@/modules/plan-usage/utils/planUsageFormat';

/** Below this the badge stays hidden: the session window only needs attention when it is filling up. */
const BADGE_THRESHOLD = 0.7;

/** A small 5-hour usage figure for next to the context ring, shown only from 70%. */
export default function PlanUsageBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { usage } = usePlanUsage();
  const fiveHour = usage?.windows.fiveHour;
  if (!fiveHour || fiveHour.utilization < BADGE_THRESHOLD) {
    return null;
  }
  const percent = toPercent(fiveHour.utilization);
  const label = t('common:planUsage.badge', { percent, defaultValue: '5h {{percent}}%' });

  return (
    <span
      className={cn('text-[10px] font-semibold tabular-nums', planUsageColorClass(fiveHour.utilization).text, className)}
      title={t('common:planUsage.session', { defaultValue: 'Session (5 hours)' })}
      data-testid="plan-usage-badge"
    >
      {label}
    </span>
  );
}
