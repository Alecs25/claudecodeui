import { useCallback, useMemo } from 'react';
import { MessageSquare, Pin } from 'lucide-react';
import type { TFunction } from 'i18next';

import { Button } from '@/shared/ui';
import type { ProjectSession, RecentConversationListItem, SessionRowActions, SessionWithProvider } from '@/shared/types';
import SidebarSessionItem from '@/modules/sidebar/SidebarSessionItem';

type SidebarRecentConversationsProps = {
  conversations: RecentConversationListItem[];
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasError: boolean;
  /** Whether a status filter narrows the list, which changes what an empty list means. */
  isFiltered: boolean;
  selectedSession: ProjectSession | null;
  currentTime: Date;
  /**
   * The same row state and callbacks the grouped list hands its rows, so a
   * conversation can be renamed, copied, forked or archived from here too.
   */
  sessionActions: SessionRowActions;
  onConversationSelect: (
    projectId: string | null,
    sessionId: string,
    provider: string,
  ) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  t: TFunction;
};

type FlatRow = { session: SessionWithProvider; projectId: string | null; projectLabel: string };

function RecentConversationSkeleton() {
  return (
    <div className="space-y-px px-1" aria-label="Loading recent conversations">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="flex min-h-10 items-center gap-2.5 px-2">
          <div className="h-3 w-3 animate-pulse rounded-full bg-muted" />
          <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${72 - index * 3}%` }} />
        </div>
      ))}
    </div>
  );
}

/** Rendered by SidebarContent for the flat view: pinned sessions first, then every other session by recency, without project groups. */
export default function SidebarRecentConversations({
  conversations,
  hasMore,
  isLoading,
  isLoadingMore,
  hasError,
  isFiltered,
  selectedSession,
  currentTime,
  sessionActions,
  onConversationSelect,
  onLoadMore,
  onRetry,
  t,
}: SidebarRecentConversationsProps) {
  // Built once per page of conversations so each row receives the same session
  // object between renders and its memo boundary holds.
  const rows = useMemo<FlatRow[]>(() => conversations.map((conversation) => ({
    projectId: conversation.projectId,
    projectLabel: conversation.projectDisplayName,
    session: {
      id: conversation.sessionId,
      summary: conversation.sessionTitle,
      lastActivity: conversation.lastActivity ?? undefined,
      __provider: conversation.provider,
      __projectId: conversation.projectId ?? undefined,
      isPinned: conversation.isPinned,
      isUnread: conversation.isUnread,
      isCompleted: conversation.isCompleted,
    },
  })), [conversations]);

  const selectRow = useCallback((session: SessionWithProvider, projectId: string) => {
    onConversationSelect(projectId || null, session.id, session.__provider);
  }, [onConversationSelect]);

  if (isLoading && conversations.length === 0) {
    return <RecentConversationSkeleton />;
  }

  if (hasError && conversations.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <MessageSquare className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          {t('recent.loadFailed', 'Could not load recent conversations')}
        </p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={onRetry}>
          {t('buttons.retry', { ns: 'common', defaultValue: 'Try again' })}
        </Button>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-xs text-muted-foreground">
        {isFiltered
          ? t('recent.noMatchingStatus', { defaultValue: 'No conversations' })
          : t('recent.emptyTitle', 'No conversations yet')}
      </p>
    );
  }

  const pinnedRows = rows.filter((row) => row.session.isPinned);
  const otherRows = rows.filter((row) => !row.session.isPinned);
  const rename = sessionActions.activeRename;

  const renderRow = ({ session, projectId, projectLabel }: FlatRow) => {
    const hasBackgroundWork = sessionActions.backgroundSessionIds.has(session.id);
    // Resolved per row so a keystroke in one rename does not redraw the rest.
    const isEditing = rename?.target === 'session' && rename.id === session.id;
    return (
      <SidebarSessionItem
        key={session.id}
        projectId={projectId}
        projectLabel={projectLabel}
        session={session}
        selectedSession={selectedSession}
        isProcessing={sessionActions.activeSessions.has(session.id) && !hasBackgroundWork}
        hasBackgroundWork={hasBackgroundWork}
        needsAttention={sessionActions.attentionSessionIds.has(session.id)}
        isWaiting={sessionActions.waitingSessionIds.has(session.id)}
        currentTime={currentTime}
        isEditing={isEditing}
        renameDraft={isEditing ? rename.draft : ''}
        onRenameDraftChange={sessionActions.onRenameDraftChange}
        onStartEditingSession={sessionActions.onStartEditingSession}
        onCancelEditingSession={sessionActions.onCancelEditingSession}
        onSaveEditingSession={sessionActions.onSaveEditingSession}
        onSessionSelect={selectRow}
        onDeleteSession={sessionActions.onDeleteSession}
        onArchiveSession={sessionActions.onArchiveSession}
        onForkSession={sessionActions.onForkSession}
        onSetSessionStatus={sessionActions.onSetSessionStatus}
        onOpenInSplitView={sessionActions.onOpenInSplitView}
        t={t}
      />
    );
  };

  return (
    <div data-testid="recent-conversations-list">
      {pinnedRows.length > 0 && (
        <section aria-label={t('sessionStatus.pinnedSection', { defaultValue: 'Pinned' })} className="pb-1">
          <h3 className="flex min-h-8 items-center gap-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Pin className="h-3 w-3" />
            {t('sessionStatus.pinnedSection', { defaultValue: 'Pinned' })}
          </h3>
          <div className="space-y-px">{pinnedRows.map(renderRow)}</div>
        </section>
      )}

      {otherRows.length > 0 && (
        <section aria-label={t('recent.title', 'Recent conversations')}>
          {pinnedRows.length > 0 && (
            <h3 className="flex min-h-8 items-center px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t('recent.sectionTitle', { defaultValue: 'Recent' })}
            </h3>
          )}
          <div className="space-y-px">{otherRows.map(renderRow)}</div>
        </section>
      )}

      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 h-9 w-full text-xs text-muted-foreground"
          onClick={onLoadMore}
          disabled={isLoadingMore}
        >
          {isLoadingMore
            ? t('recent.loadingMore', 'Loading more...')
            : t('recent.loadMore', 'Load older conversations')}
        </Button>
      )}
    </div>
  );
}
