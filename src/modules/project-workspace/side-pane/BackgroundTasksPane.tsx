import { useTranslation } from 'react-i18next';

import { BackgroundTaskList, useBackgroundTasksEntry } from '@/modules/chat';

/**
 * Rendered in the workspace's right pane: the session's running background
 * tasks, as the chat's strip worked them out, each openable and stoppable.
 */
export default function BackgroundTasksPane({ sessionId, onTaskOpened }: {
  sessionId: string | null;
  /** Called when a task's row is opened in the chat, e.g. to leave a full-screen pane. */
  onTaskOpened?: () => void;
}) {
  const { t } = useTranslation();
  const entry = useBackgroundTasksEntry(sessionId);

  if (!entry) {
    return (
      <p className="p-4 text-center text-sm text-muted-foreground">
        {t('panes.noBackgroundTasks', { defaultValue: 'No background tasks' })}
      </p>
    );
  }

  return (
    <BackgroundTaskList
      items={entry.items}
      sendMessage={entry.sendMessage}
      onOpen={onTaskOpened}
      className="h-full overflow-y-auto py-1 text-sm"
    />
  );
}
