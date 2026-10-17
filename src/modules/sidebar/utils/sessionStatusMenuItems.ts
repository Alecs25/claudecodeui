import { CheckCircle2, Mail, MailOpen, Pin, PinOff, RotateCcw } from 'lucide-react';
import type { TFunction } from 'i18next';

import type { ActionMenuItem } from '@/shared/ui';
import type { SessionStatusFlags, SessionStatusPatch } from '@/shared/types';

/**
 * The pin, unread and completed toggles, labelled for the session's current
 * state. Used by SessionOptions (desktop menu) and SidebarSessionItem (mobile sheet)
 * so both offer the same actions.
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
