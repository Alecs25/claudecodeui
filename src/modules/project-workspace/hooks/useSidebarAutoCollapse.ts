import { useCallback, useEffect, useState } from 'react';

import { useWorkspaceRightColumn } from '@/modules/project-workspace/context/WorkspaceLayoutContext';
import { isChatCrampedByPane, shouldAutoCollapseSidebar } from '@/modules/project-workspace/utils/sidebarAutoCollapse';

const readViewportWidth = (): number => (typeof window === 'undefined' ? 0 : window.innerWidth);

function useViewportWidth(): number {
  const [viewportWidth, setViewportWidth] = useState(readViewportWidth);
  useEffect(() => {
    const handleResize = () => setViewportWidth(readViewportWidth());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return viewportWidth;
}

type UseSidebarAutoCollapseOptions = {
  isMobile: boolean;
  sidebarVisible: boolean;
  sidebarWidth: number;
};

/**
 * Used by ProjectSidebarRegion: whether the docked sidebar is folded to its rail
 * for the open right pane, and the callback a manual expand calls so that pane
 * keeps the full sidebar until it closes.
 */
export function useSidebarAutoCollapse({ isMobile, sidebarVisible, sidebarWidth }: UseSidebarAutoCollapseOptions) {
  const rightColumn = useWorkspaceRightColumn();
  const viewportWidth = useViewportWidth();
  const rightColumnKey = rightColumn?.key ?? null;
  const [manuallyExpandedForKey, setManuallyExpandedForKey] = useState<string | null>(null);

  // A different pane (or none) starts over: the manual expand belonged to the previous one.
  const [lastRightColumnKey, setLastRightColumnKey] = useState(rightColumnKey);
  if (lastRightColumnKey !== rightColumnKey) {
    setLastRightColumnKey(rightColumnKey);
    setManuallyExpandedForKey(null);
  }

  const isChatCramped = !isMobile && isChatCrampedByPane({ viewportWidth, sidebarWidth, rightColumn });
  const isAutoCollapsed = shouldAutoCollapseSidebar({
    isChatCramped,
    sidebarVisible,
    rightColumnKey,
    manuallyExpandedForKey,
  });

  const markManualExpand = useCallback(() => {
    if (isChatCramped) {
      setManuallyExpandedForKey(rightColumnKey);
    }
  }, [isChatCramped, rightColumnKey]);

  return { isAutoCollapsed, markManualExpand };
}
