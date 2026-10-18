import { Archive, CheckCircle2, Columns2, Edit2, GitBranch, Mail, MailOpen, Pin, PinOff, RotateCcw, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TFunction } from 'i18next';

import type { ActionMenuItem } from '@/shared/ui';
import type { SessionStatusFlags, SessionStatusPatch } from '@/shared/types';

/**
 * The pin, unread and completed toggles, labelled for the session's current
 * state. Part of every session menu built by buildSessionMenuItems.
 */
export function buildSessionStatusItems(
  sessionId: string,
  status: Partial<SessionStatusFlags> | undefined,
  onSetSessionStatus: ((sessionId: string, patch: SessionStatusPatch) => void) | undefined,
  t: TFunction,
): ActionMenuItem[] {
  if (!onSetSessionStatus) {
    return [];
  }
  const isPinned = Boolean(status?.isPinned);
  const isUnread = Boolean(status?.isUnread);
  const isCompleted = Boolean(status?.isCompleted);
  return [
    {
      key: 'pin',
      label: isPinned
        ? t('sessionStatus.unpin', { defaultValue: 'Unpin' })
        : t('sessionStatus.pin', { defaultValue: 'Pin' }),
      icon: isPinned ? PinOff : Pin,
      onSelect: () => onSetSessionStatus(sessionId, { isPinned: !isPinned }),
    },
    {
      key: 'unread',
      label: isUnread
        ? t('sessionStatus.markRead', { defaultValue: 'Mark as read' })
        : t('sessionStatus.markUnread', { defaultValue: 'Mark as unread' }),
      icon: isUnread ? MailOpen : Mail,
      onSelect: () => onSetSessionStatus(sessionId, { isUnread: !isUnread }),
    },
    {
      key: 'completed',
      label: isCompleted
        ? t('sessionStatus.reopen', { defaultValue: 'Reopen' })
        : t('sessionStatus.markCompleted', { defaultValue: 'Mark completed' }),
      icon: isCompleted ? RotateCcw : CheckCircle2,
      onSelect: () => onSetSessionStatus(sessionId, { isCompleted: !isCompleted }),
    },
  ];
}

type SessionMenuArgs = {
  sessionId: string;
  sessionName: string;
  /** Null where the row does not know the owning project: rename is keyed by it, so it is withheld. */
  projectId: string | null;
  status: Partial<SessionStatusFlags> | undefined;
  /** A session with a response in flight cannot be forked, archived or deleted. */
  isProcessing: boolean;
  canFork: boolean;
  canDelete: boolean;
  copy: { label: string; description?: string; icon: LucideIcon; loading: boolean; onSelect: () => void };
  onStartEditingSession: (projectId: string, sessionId: string, initialName: string) => void;
  onSetSessionStatus?: (sessionId: string, patch: SessionStatusPatch) => void;
  onOpenInSplitView?: () => void;
  onFork?: () => void;
  onArchiveSession?: (sessionId: string) => void;
  onDeleteSession: (sessionId: string, sessionTitle: string) => void;
  t: TFunction;
};

/**
 * Every action of a session row, in one order. SessionOptions (the pointer
 * menu) and SessionActionsSheet (the touch sheet) both draw this list, so the
 * two ways into a row's actions cannot offer different things.
 */
export function buildSessionMenuItems({
  sessionId,
  sessionName,
  projectId,
  status,
  isProcessing,
  canFork,
  canDelete,
  copy,
  onStartEditingSession,
  onSetSessionStatus,
  onOpenInSplitView,
  onFork,
  onArchiveSession,
  onDeleteSession,
  t,
}: SessionMenuArgs): ActionMenuItem[] {
  const [pinItem, unreadItem, completedItem] = buildSessionStatusItems(sessionId, status, onSetSessionStatus, t);
  const items: (ActionMenuItem | undefined | false)[] = [
    projectId !== null && {
      key: 'rename',
      label: t('sessionMenu.rename', { defaultValue: 'Rename' }),
      icon: Edit2,
      onSelect: () => onStartEditingSession(projectId, sessionId, sessionName),
    },
    pinItem,
    unreadItem,
    onOpenInSplitView && {
      key: 'split',
      label: t('sessionStatus.openInSplitView', { defaultValue: 'Open in split view' }),
      icon: Columns2,
      onSelect: onOpenInSplitView,
    },
    completedItem,
    {
      key: 'copy',
      label: copy.label,
      description: copy.description,
      icon: copy.icon,
      loading: copy.loading,
      closeOnSelect: false,
      onSelect: copy.onSelect,
    },
    canFork && onFork && {
      key: 'fork',
      label: t('sessionMenu.fork', { defaultValue: 'Fork' }),
      icon: GitBranch,
      onSelect: onFork,
    },
    !isProcessing && onArchiveSession && {
      key: 'archive',
      label: t('sessionMenu.archive', { defaultValue: 'Archive' }),
      icon: Archive,
      onSelect: () => onArchiveSession(sessionId),
    },
    canDelete && !isProcessing && {
      key: 'delete',
      label: t('sessionMenu.delete', { defaultValue: 'Delete…' }),
      icon: Trash2,
      isDanger: true,
      showDividerBefore: true,
      onSelect: () => onDeleteSession(sessionId, sessionName),
    },
  ];
  return items.filter((item): item is ActionMenuItem => Boolean(item));
}
