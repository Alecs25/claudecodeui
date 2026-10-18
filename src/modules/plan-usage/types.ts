/** One usage window as the server reports it (`/api/plan-usage`, `plan_usage` event). */
export type PlanUsageWindow = {
  /** Share of the window used, 0–1. */
  utilization: number;
  /** Unix epoch milliseconds, or null when the server could not read the reset time. */
  resetsAt: number | null;
  /** The reset as the CLI wrote it, sent when it could not be turned into a time. */
  resetsText?: string;
};

export type PlanUsageModelWindow = PlanUsageWindow & { label: string };

export type PlanUsageState = {
  windows: {
    fiveHour?: PlanUsageWindow;
    sevenDay?: PlanUsageWindow;
    perModel?: PlanUsageModelWindow[];
  };
  status: string | null;
  isUsingOverage: boolean | null;
  updatedAt: string | null;
  source: 'stream' | 'usage-command' | null;
  details: string | null;
  refreshError: string | null;
};
