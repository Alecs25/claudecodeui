import { MoreHorizontal } from 'lucide-react';
import type { TFunction } from 'i18next';

import { ActionMenu } from '@/shared/ui';
import { cn } from '@/shared/utils';
import type { LLMProvider, SessionStatusFlags, SessionStatusPatch } from '@/shared/types';
import { buildSessionMenuItems } from '@/modules/sidebar/utils/sessionStatusMenuItems';
import { useSessionForkingProviders } from '@/shared/hooks/useProviderCapabilities';
import { useProviderSessionIdCopy } from '@/modules/sidebar/hooks/useProviderSessionIdCopy';
import { PROVIDER_LABELS } from '@/modules/sidebar/utils/sidebarProjectFormatting';

type SessionOptionsProps = {
  sessionId: string;
  sessionName: string;
  provider: LLMProvider;
  /**
   * The project that owns the session. Null where the row does not know it, in
   * which case rename is withheld rather than guessed — it is keyed by project.
   */
  projectId: string | null;
  /** Shown under the title in the menu header, next to the provider. */
  projectLabel?: string;
  /** A running session cannot be archived, deleted or forked. */
  isProcessing: boolean;
  onStartEditingSession: (projectId: string, sessionId: string, initialName: string) => void;
  onDeleteSession: (sessionId: string, sessionTitle: string) => void;
  onArchiveSession?: (sessionId: string) => void;
  /** Bound by the caller, which owns the session object the fork needs. */
  onFork?: () => void;
  /** Withheld where the row has nowhere to send a delete. */
  canDelete?: boolean;
  /** The session's current status flags, which decide whether each toggle reads "pin" or "unpin" and so on. */
  status?: Partial<SessionStatusFlags>;
  onSetSessionStatus?: (sessionId: string, patch: SessionStatusPatch) => void;
  /** Absent where split view is unavailable, which hides the entry. */
  onOpenInSplitView?: () => void;
  className?: string;
  t: TFunction;
};

/**
 * A session row's "…" menu for mouse and keyboard. Touch gets the same items
 * from SessionActionsSheet, opened by a long press.
 */
export default function SessionOptions({
  sessionId,
  sessionName,
  provider,
  projectId,
  projectLabel,
  isProcessing,
  onStartEditingSession,
  onDeleteSession,
  onArchiveSession,
  onFork,
  canDelete = true,
  status,
  onSetSessionStatus,
  onOpenInSplitView,
  className,
  t,
}: SessionOptionsProps) {
  const providerLabel = PROVIDER_LABELS[provider];
  const { copyState, copyLabel, setOptionsOpen, handleCopyAction, isCopyPending, CopyStateIcon } =
    useProviderSessionIdCopy(sessionId, providerLabel);

  // Read from the backend capability matrix rather than branching on the
  // provider id here; the request is cached module-side, so every row shares one.
  const forkableProviders = useSessionForkingProviders();
  const canFork = Boolean(onFork) && forkableProviders.has(provider) && !isProcessing;

  const optionsLabel = t('sessionMenu.options', { defaultValue: 'Session options' });

  return (
    <div className={cn('flex items-center', className)}>
      <ActionMenu
        label={optionsLabel}
        ariaLabel={`${optionsLabel}: ${sessionName}`}
        icon={MoreHorizontal}
        iconOnly
        portal
        variant="ghost"
        size="icon"
        onOpenChange={setOptionsOpen}
        triggerClassName="h-7 w-7 text-muted-foreground hover:bg-muted hover:text-foreground"
        menuClassName="w-[260px] rounded-xl p-1.5 shadow-xl"
        header={(
          <div className="mb-1 border-b border-border px-3 py-2">
            <p className="truncate text-xs font-medium text-foreground" title={sessionName}>
              {sessionName}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {projectLabel ? `${projectLabel} · ${providerLabel}` : providerLabel}
            </p>
          </div>
        )}
        items={buildSessionMenuItems({
          sessionId,
          sessionName,
          projectId,
          status,
          isProcessing,
          canFork,
          canDelete,
          copy: {
            label: copyLabel,
            description: copyState === 'error' ? t('sessionMenu.retry', { defaultValue: 'Try again' }) : undefined,
            icon: CopyStateIcon,
            loading: isCopyPending,
            onSelect: handleCopyAction,
          },
          onStartEditingSession,
          onSetSessionStatus,
          onOpenInSplitView,
          onFork,
          onArchiveSession,
          onDeleteSession,
          t,
        })}
      />
    </div>
  );
}
