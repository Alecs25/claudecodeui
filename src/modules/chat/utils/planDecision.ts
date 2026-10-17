/** How the user answered the plan, read from the tool result once there is one. */
export type PlanDecision =
  | { state: 'approved' }
  | { state: 'rejected'; feedback?: string };

export type PlanToolResult = { content?: unknown; isError?: boolean } | null | undefined;

// Deny messages that carry no feedback worth repeating under "Rejected".
const BARE_DENIAL_MESSAGES = ['user denied tool use', 'permission request cancelled', 'permission request timed out'];

/**
 * A plan's result is the approval, or the deny message the agent got back:
 * the revise prefix plus whatever the user typed.
 */
export function readPlanDecision(toolResult: PlanToolResult, reviseText: string): PlanDecision | undefined {
  if (!toolResult) {
    return undefined;
  }
  const message = String(toolResult.content ?? '').trim();
  if (!toolResult.isError) {
    // Codex turns a proposed plan into a plan row with an empty result: there
    // was no approval round trip, so there is nothing to report.
    return message ? { state: 'approved' } : undefined;
  }
  if (!message || message === reviseText || BARE_DENIAL_MESSAGES.includes(message.toLowerCase())) {
    return { state: 'rejected' };
  }
  const prefix = `${reviseText}: `;
  return { state: 'rejected', feedback: message.startsWith(prefix) ? message.slice(prefix.length) : message };
}
