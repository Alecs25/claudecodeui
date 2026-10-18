import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import type { TFunction } from 'i18next';

import { Dialog, DialogContent, DialogTitle } from '@/shared/ui';
import { cn } from '@/shared/utils';
import type { LLMProvider, SessionStatusFlags, SessionStatusPatch } from '@/shared/types';
import { useSessionForkingProviders } from '@/shared/hooks/useProviderCapabilities';
import { useProviderSessionIdCopy } from '@/modules/sidebar/hooks/useProviderSessionIdCopy';
import { buildSessionMenuItems } from '@/modules/sidebar/utils/sessionStatusMenuItems';
import { PROVIDER_LABELS } from '@/modules/sidebar/utils/sidebarProjectFormatting';

type SessionActionsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  sessionName: string;
  provider: LLMProvider;
  projectId: string | null;
  projectLabel?: string;
  isProcessing: boolean;
  onStartEditingSession: (projectId: string, sessionId: string, initialName: string) => void;
  onDeleteSession: (sessionId: string, sessionTitle: string) => void;
  onArchiveSession?: (sessionId: string) => void;
  onFork?: () => void;
  status?: Partial<SessionStatusFlags>;
  onSetSessionStatus?: (sessionId: string, patch: SessionStatusPatch) => void;
  onOpenInSplitView?: () => void;
  t: TFunction;
};

/**
 * The bottom sheet a long press on a session row opens: the same items as the
 * "…" menu, sized for a finger. Rendered by SidebarSessionItem only while open,
 * so the rows of a long list do not each carry a closed dialog.
 */
export default function SessionActionsSheet({
  open,
  onOpenChange,
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
  status,
  onSetSessionStatus,
  onOpenInSplitView,
  t,
}: SessionActionsSheetProps) {
  const providerLabel = PROVIDER_LABELS[provider];
  const { copyState, copyLabel, setOptionsOpen, handleCopyAction, isCopyPending, CopyStateIcon } =
    useProviderSessionIdCopy(sessionId, providerLabel);
  const forkableProviders = useSessionForkingProviders();
  const canFork = Boolean(onFork) && forkableProviders.has(provider) && !isProcessing;

  // Mounted open: fetch the provider id the copy item needs right away.
  useEffect(() => {
    setOptionsOpen(true);
  }, [setOptionsOpen]);

  const setSheetOpen = (next: boolean) => {
    setOptionsOpen(next);
    onOpenChange(next);
  };

  const items = buildSessionMenuItems({
    sessionId,
    sessionName,
    projectId,
    status,
    isProcessing,
    canFork,
    canDelete: true,
    copy: {
      label: copyLabel,
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
  });

  return (
    <Dialog open={open} onOpenChange={setSheetOpen}>
      <DialogContent
        aria-describedby={undefined}
        animationClassName="animate-bottom-sheet-content-show motion-reduce:animate-none"
        className="bottom-0 left-0 top-auto max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-2xl border-x-0 border-b-0 px-3 pb-safe-area-inset-bottom pt-3"
      >
        <DialogTitle>{t('sessionMenu.options', { defaultValue: 'Session options' })}</DialogTitle>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />

        <div className="mb-2 px-3">
          <p className="truncate text-sm font-medium text-foreground" title={sessionName}>{sessionName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {projectLabel ? `${projectLabel} · ${providerLabel}` : providerLabel}
          </p>
        </div>

        <div className="mb-3 border-t border-border pt-1">
          {items.map((item) => {
            const ItemIcon = item.loading ? Loader2 : item.icon;
            return (
              <button
                key={item.key}
                type="button"
                disabled={item.loading}
                onClick={() => {
                  if (item.closeOnSelect !== false) {
                    setSheetOpen(false);
                  }
                  item.onSelect();
                }}
                className={cn(
                  'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors active:bg-muted',
                  item.showDividerBefore && 'mt-1 border-t border-border',
                  item.isDanger ? 'text-red-600 dark:text-red-400' : 'text-foreground',
                  item.key === 'copy' && copyState === 'copied' && 'text-green-700 dark:text-green-300',
                )}
              >
                {ItemIcon && <ItemIcon className={cn('h-4 w-4 flex-shrink-0', item.loading && 'animate-spin')} />}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
