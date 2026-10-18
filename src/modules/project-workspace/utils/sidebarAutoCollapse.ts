/**
 * When a right pane (or the split session) opens on a tablet-sized screen, the
 * sidebar folds to its icon rail so the chat keeps a usable width. Pure, so the
 * decision is testable without rendering the workspace.
 */

/** Below this the sidebar is a drawer and never docked, so there is nothing to fold. */
export const AUTO_COLLAPSE_MIN_VIEWPORT_PX = 768;
/** The narrowest chat column the composer and its toolbar stay readable at. */
export const CHAT_MIN_WIDTH_WITH_PANE_PX = 420;

/**
 * What occupies the column right of the chat. `width: 'split'` is the second
 * session, which shares the main area evenly with the chat.
 */
export type WorkspaceRightColumn = {
  /** Identifies the pane, so a manual expand is respected only while that pane stays open. */
  key: string;
  width: number | 'split';
};

type CrampedChatInput = {
  viewportWidth: number;
  /** The full (expanded) sidebar width, not the rail: the question is whether the full sidebar fits. */
  sidebarWidth: number;
  rightColumn: WorkspaceRightColumn | null;
};

/** True when, with the full sidebar docked, the chat column would drop below CHAT_MIN_WIDTH_WITH_PANE_PX. */
export function isChatCrampedByPane({ viewportWidth, sidebarWidth, rightColumn }: CrampedChatInput): boolean {
  if (!rightColumn || viewportWidth < AUTO_COLLAPSE_MIN_VIEWPORT_PX) {
    return false;
  }
  const mainWidth = viewportWidth - sidebarWidth;
  const chatWidth = rightColumn.width === 'split' ? mainWidth / 2 : mainWidth - rightColumn.width;
  return chatWidth < CHAT_MIN_WIDTH_WITH_PANE_PX;
}

type AutoCollapseInput = {
  isChatCramped: boolean;
  /** The user's stored expanded/collapsed choice; auto-collapse never writes it. */
  sidebarVisible: boolean;
  rightColumnKey: string | null;
  /** The pane during which the user expanded the sidebar by hand, if any. */
  manuallyExpandedForKey: string | null;
};

/**
 * Folds the sidebar only when the user left it expanded and has not reopened it
 * for this pane. Derived, not stored: closing the pane (or widening the screen)
 * brings the sidebar back exactly as the user left it.
 */
export function shouldAutoCollapseSidebar({
  isChatCramped,
  sidebarVisible,
  rightColumnKey,
  manuallyExpandedForKey,
}: AutoCollapseInput): boolean {
  if (!isChatCramped || !sidebarVisible) {
    return false;
  }
  return manuallyExpandedForKey === null || manuallyExpandedForKey !== rightColumnKey;
}
