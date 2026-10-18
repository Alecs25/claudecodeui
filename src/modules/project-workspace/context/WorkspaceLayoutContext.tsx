import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { WorkspaceRightColumn } from '@/modules/project-workspace/utils/sidebarAutoCollapse';

type WorkspaceLayoutState = {
  rightColumn: WorkspaceRightColumn | null;
  setRightColumn: (column: WorkspaceRightColumn | null) => void;
};

const WorkspaceLayoutContext = createContext<WorkspaceLayoutState | null>(null);

/**
 * Rendered by ProjectWorkspaceShell: the main region reports what sits right of
 * the chat, and the sidebar region reads it to decide whether to fold to its rail.
 */
export function WorkspaceLayoutProvider({ children }: { children: ReactNode }) {
  const [rightColumn, setRightColumn] = useState<WorkspaceRightColumn | null>(null);
  const value = useMemo(() => ({ rightColumn, setRightColumn }), [rightColumn]);
  return <WorkspaceLayoutContext.Provider value={value}>{children}</WorkspaceLayoutContext.Provider>;
}

/** Null outside the provider (isolated renders in tests), which means "no right pane". */
export function useWorkspaceRightColumn(): WorkspaceRightColumn | null {
  return useContext(WorkspaceLayoutContext)?.rightColumn ?? null;
}

/** Publishes the right column from WorkspaceMain; primitives as dependencies so a re-render does not re-publish. */
export function useReportWorkspaceRightColumn(key: string | null, width: number | 'split'): void {
  const setRightColumn = useContext(WorkspaceLayoutContext)?.setRightColumn;
  useEffect(() => {
    setRightColumn?.(key === null ? null : { key, width });
  }, [key, setRightColumn, width]);
  useEffect(() => () => setRightColumn?.(null), [setRightColumn]);
}
