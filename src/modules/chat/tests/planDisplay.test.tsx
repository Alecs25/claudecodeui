import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

import '@/modules/i18n';
import PermissionContext from '@/modules/chat/context/PermissionContext';
import { PlanDisplay } from '@/modules/chat/tools/PlanDisplay';
import { readPlanDecision } from '@/modules/chat/utils/planDecision';

const PLAN = '## Steps\n\n| Step | File |\n| --- | --- |\n| 1 | a.ts |';
const REVISE = 'User asked to revise the plan';

function renderPlan(props: Partial<React.ComponentProps<typeof PlanDisplay>> = {}) {
  const handlePermissionDecision = vi.fn();
  render(
    <PermissionContext.Provider
      value={{
        pendingPermissionRequests: [{ requestId: 'req-1', toolName: 'ExitPlanMode', input: { plan: PLAN } }],
        handlePermissionDecision,
      }}
    >
      <PlanDisplay title="Implementation plan" content={PLAN} defaultOpen toolName="ExitPlanMode" {...props} />
    </PermissionContext.Provider>,
  );
  return handlePermissionDecision;
}

describe('the plan approval card', () => {
  it('renders the plan as Markdown with its table', () => {
    renderPlan();
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'a.ts' })).toBeTruthy();
  });

  it('while the plan waits, says so and leaves the answer to the card in the composer', () => {
    renderPlan();
    expect(screen.getByTestId('plan-waiting').textContent).toContain('Waiting for your approval');
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('says how an answered plan went, with the feedback, and offers no actions', () => {
    renderPlan({ toolResult: { content: `${REVISE}: Skip the migration`, isError: true } });
    expect(screen.getByText('Rejected')).toBeTruthy();
    expect(screen.getByText('Skip the migration')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('reads the decision from the result', () => {
    expect(readPlanDecision(undefined, REVISE)).toBeUndefined();
    expect(readPlanDecision({ content: 'User has approved your plan.', isError: false }, REVISE)).toEqual({ state: 'approved' });
    // Codex plan rows carry an empty result: no approval happened.
    expect(readPlanDecision({ content: '', isError: false }, REVISE)).toBeUndefined();
    expect(readPlanDecision({ content: REVISE, isError: true }, REVISE)).toEqual({ state: 'rejected' });
    expect(readPlanDecision({ content: 'User denied tool use', isError: true }, REVISE)).toEqual({ state: 'rejected' });
  });
});
