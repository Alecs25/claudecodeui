/**
 * Reading a refused tool call out of its result.
 *
 * A tool the permission layer refused comes back as an error result whose text
 * is the refusal itself: the message the composer's Deny sent, the reason the
 * Claude runtime gave (a settings rule, a timeout), or the CLI's own rejection
 * with whatever the user told Claude to do instead. The row shows that reason
 * rather than reading as a failed tool.
 */

/** Refusals the Claude runtime adapter and the Claude CLI write, lowercased. */
const DENIAL_MARKERS = [
  'user denied tool use',
  'tool disallowed by settings',
  'permission request timed out',
  'permission request cancelled',
  "the user doesn't want to proceed with this tool use",
];

/** The CLI appends what the user said when they refused with a message. */
const USER_FEEDBACK_MARKER = 'the user said:';

export type ToolDenial = {
  /** What the user or the settings said; null when the refusal gave no reason. */
  reason: string | null;
};

/**
 * The refusal behind an error tool result, or null when the tool ran and
 * failed (or succeeded). `extraMarkers` adds refusal texts that are not fixed,
 * like the Deny message in the user's language.
 */
export function readToolDenial(
  toolResult: { isError?: boolean; content?: unknown } | null | undefined,
  extraMarkers: string[] = [],
): ToolDenial | null {
  if (!toolResult?.isError) {
    return null;
  }

  const content = typeof toolResult.content === 'string' ? toolResult.content.trim() : '';
  const lowered = content.toLowerCase();
  const markers = [...DENIAL_MARKERS, ...extraMarkers.map((marker) => marker.trim().toLowerCase()).filter(Boolean)];
  if (!content || !markers.some((marker) => lowered.includes(marker))) {
    return null;
  }

  const feedbackAt = lowered.indexOf(USER_FEEDBACK_MARKER);
  if (feedbackAt >= 0) {
    const feedback = content.slice(feedbackAt + USER_FEEDBACK_MARKER.length).trim();
    if (feedback) {
      return { reason: feedback };
    }
  }

  // The CLI's bare rejection is instructions to the model, and a plain Deny
  // says no more than the row's "Denied" does: neither is a reason.
  const isBareDeny = lowered === 'user denied tool use'
    || extraMarkers.some((marker) => marker.trim().toLowerCase() === lowered);
  if (isBareDeny || lowered.startsWith("the user doesn't want to proceed")) {
    return { reason: null };
  }
  return { reason: content };
}
