import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import '@/modules/i18n';
import { api } from '@/shared/api';
import PlanUsageBadge from '@/modules/plan-usage/PlanUsageBadge';
import PlanUsageSection from '@/modules/plan-usage/PlanUsageSection';
import { resetPlanUsageStore } from '@/modules/plan-usage/hooks/usePlanUsage';
import type { PlanUsageState } from '@/modules/plan-usage/types';
import { formatResetTime, planUsageColorClass } from '@/modules/plan-usage/utils/planUsageFormat';

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: status < 400, data }), { status, headers: { 'Content-Type': 'application/json' } });

const usageState = (overrides: Partial<PlanUsageState> = {}): PlanUsageState => ({
  windows: {
    fiveHour: { utilization: 0.15, resetsAt: Date.now() + 60 * 60_000 },
    sevenDay: { utilization: 0.92, resetsAt: Date.now() + 4 * 24 * 60 * 60_000 },
    perModel: [{ label: 'Fable', utilization: 0, resetsAt: null, resetsText: 'Oct 22, 11am' }],
  },
  status: 'allowed',
  isUsingOverage: false,
  updatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  source: 'usage-command',
  details: "What's contributing to your limits usage?\nLast 24h · 1523 requests",
  refreshError: null,
  ...overrides,
});

describe('plan usage formatting', () => {
  it('shows only the time for a reset today and the weekday and day otherwise', () => {
    const now = new Date(2026, 9, 18, 10, 0).getTime();
    expect(formatResetTime(new Date(2026, 9, 18, 14, 10).getTime(), now, 'it-IT')).toEqual({ isToday: true, text: '14:10' });
    expect(formatResetTime(new Date(2026, 9, 22, 11, 0).getTime(), now, 'it-IT')).toEqual({ isToday: false, text: 'gio 22, 11:00' });
  });

  it('turns amber from 70% and red from 90%', () => {
    expect(planUsageColorClass(0.69).bar).toBe('bg-primary');
    expect(planUsageColorClass(0.7).bar).toBe('bg-amber-500');
    expect(planUsageColorClass(0.9).bar).toBe('bg-red-500');
  });
});

describe('PlanUsageSection', () => {
  beforeEach(() => {
    resetPlanUsageStore();
  });

  it('renders the session, weekly and per-model bars with the details', async () => {
    vi.spyOn(api.planUsage, 'get').mockResolvedValue(jsonResponse(usageState()));
    render(<PlanUsageSection />);

    await waitFor(() => expect(screen.getAllByTestId('plan-usage-row')).toHaveLength(3));
    expect(screen.getByRole('progressbar', { name: 'Session (5 hours)' }).getAttribute('aria-valuenow')).toBe('15');
    expect(screen.getByText('92%').className).toContain('text-red-500');
    expect(screen.getByText('Week (Fable)')).toBeTruthy();
    expect(screen.getByText('resets Oct 22, 11am')).toBeTruthy();
    expect(screen.getByText(/^resets at /)).toBeTruthy();
    expect(screen.getByText('updated 5 min ago')).toBeTruthy();
    expect(screen.getByText('Details')).toBeTruthy();
  });

  it('refreshes on demand and shows the new numbers', async () => {
    vi.spyOn(api.planUsage, 'get').mockResolvedValue(jsonResponse(usageState()));
    const refresh = vi.spyOn(api.planUsage, 'refresh').mockResolvedValue(jsonResponse(usageState({
      windows: { fiveHour: { utilization: 0.4, resetsAt: null } },
      updatedAt: new Date().toISOString(),
    })));
    render(<PlanUsageSection />);
    await waitFor(() => expect(screen.getAllByTestId('plan-usage-row')).toHaveLength(3));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('plan-usage-row')).toHaveLength(1);
    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.getByText('updated just now')).toBeTruthy();
  });

  it('says there is no data yet when the server has none', async () => {
    vi.spyOn(api.planUsage, 'get').mockResolvedValue(jsonResponse(usageState({ windows: {}, updatedAt: null, details: null })));
    render(<PlanUsageSection />);
    await waitFor(() => expect(screen.getByText('No data yet')).toBeTruthy());
    expect(screen.queryByText('Details')).toBeNull();
  });
});

describe('PlanUsageBadge', () => {
  beforeEach(() => {
    resetPlanUsageStore();
  });

  it('stays hidden below 70% of the session window', async () => {
    const get = vi.spyOn(api.planUsage, 'get').mockResolvedValue(jsonResponse(usageState()));
    render(<PlanUsageBadge />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.queryByTestId('plan-usage-badge')).toBeNull();
  });

  it('shows the 5-hour percentage from 70%', async () => {
    vi.spyOn(api.planUsage, 'get').mockResolvedValue(jsonResponse(usageState({
      windows: { fiveHour: { utilization: 0.74, resetsAt: null } },
    })));
    render(<PlanUsageBadge />);
    await waitFor(() => expect(screen.getByTestId('plan-usage-badge').textContent).toBe('5h 74%'));
    expect(screen.getByTestId('plan-usage-badge').className).toContain('text-amber-500');
  });
});
