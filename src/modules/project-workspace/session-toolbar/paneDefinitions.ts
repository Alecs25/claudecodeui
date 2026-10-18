import { Activity, ClipboardCheck, Folder, GitBranch, GitCompareArrows, MonitorPlay, Terminal, type LucideIcon } from 'lucide-react';

import type { AppTab } from '@/shared/types';

export type BuiltInPaneId = Exclude<AppTab, 'chat' | `plugin:${string}`>;

export type PaneDefinition = {
  id: BuiltInPaneId;
  labelKey: string;
  defaultLabel: string;
  icon: LucideIcon;
};

/** The views that open beside the chat, labelled as the toolbar and the pane header show them. */
export const PANE_DEFINITIONS: Record<BuiltInPaneId, PaneDefinition> = {
  shell: { id: 'shell', labelKey: 'panes.terminal', defaultLabel: 'Terminal', icon: Terminal },
  diff: { id: 'diff', labelKey: 'panes.changes', defaultLabel: 'Changes', icon: GitCompareArrows },
  browser: { id: 'browser', labelKey: 'panes.preview', defaultLabel: 'Preview', icon: MonitorPlay },
  files: { id: 'files', labelKey: 'panes.files', defaultLabel: 'Files', icon: Folder },
  git: { id: 'git', labelKey: 'panes.git', defaultLabel: 'Git', icon: GitBranch },
  tasks: { id: 'tasks', labelKey: 'panes.plan', defaultLabel: 'Plan', icon: ClipboardCheck },
  background: { id: 'background', labelKey: 'panes.background', defaultLabel: 'Background tasks', icon: Activity },
};

export const isPaneOpen = (tab: AppTab): boolean => tab !== 'chat';
