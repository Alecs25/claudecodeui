import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ChevronDown, X } from 'lucide-react';

import type { BackgroundTaskSummary, ChatMessage } from '@/shared/types';
import {
  describeWorkflowAgent,
  findCurrentWorkflowAgent,
  formatTaskDuration,
  listRunningBackgroundLaunches,
  ownBackgroundTasks,
  readBackgroundTaskId,
  readBackgroundTaskStatus,
} from '@/modules/chat/utils/backgroundTasks';
import { useDeviceSettings } from '@/shared/hooks/useDeviceSettings';
import { parseToolPayload } from '@/modules/chat/utils/messageTransforms';
import { parseWorkflowMeta } from '@/modules/chat/utils/workflowScriptMeta';
import { publishBackgroundTasks, type BackgroundTaskItem } from '@/modules/chat/utils/backgroundTasksRegistry';

type BackgroundTasksStripProps = {
  /** Every loaded row of the session, not the visible window: a task launched pages ago is still running. */
  messages: ChatMessage[];
  /**
   * The session's running tasks as the activity map has them — from the
   * running-sessions poll after a reload, or the rows themselves once the
   * turn ended. A task whose launch row is on a page not loaded yet has no
   * row to draw from and is listed from here, so it can still be stopped.
   */
  tasks?: BackgroundTaskSummary[];
  /** The session the tasks belong to, which `chat.stop-task` names; null before one exists. */
  sessionId: string | null;
  /** The chat websocket's send, for stopping a task. */
  sendMessage: (message: unknown) => void;
  /**
   * Brings a row into view. Owned by the pane's session state because the
   * row may sit outside the visible window or in an unmounted lazy row, so
   * it takes more than an element lookup to reach it.
   */
  onReveal: (message: ChatMessage) => void;
  /** Loads the rest of the transcript, for a task whose launch row is not loaded yet. */
  onLoadAll: () => void;
};

/** The one-line description the launch was given, as the card reads it. */
function readLaunchDescription(message: ChatMessage): string {
  if (message.workflow?.description) {
    return message.workflow.description;
  }
  const input = parseToolPayload(message.toolInput);
  const { description, script } = input && typeof input === 'object'
    ? (input as { description?: unknown; script?: unknown })
    : { description: undefined, script: undefined };
  if (typeof description === 'string' && description) {
    return description;
  }
  // The CLI sets a workflow's description in the script's `meta` header, not
  // in the tool input, and reports it back as the run's first summary.
  return typeof script === 'string' ? parseWorkflowMeta(script).description ?? '' : '';
}

/** What one running task's chip says: its kind, its name, and how far it has got. */
function describeTask(message: ChatMessage, t: TFunction) {
  const live = message.taskStatus;
  const name = message.toolName === 'Workflow'
    ? message.workflow?.name || live?.workflowName || ''
    : message.subagent?.description || live?.description || '';
  const kind = message.toolName === 'Workflow'
    ? t('workflow.title', 'Workflow')
    : message.toolName === 'Bash'
      ? t('workflow.backgroundCommand', 'Command')
      : t('workflow.backgroundAgent', 'Agent');

  // A workflow reports on each agent it spawned — "2/6 agents · audit:sidebar"
  // says how many have finished and the one it is on. Short of that, its own
  // summary, unless it merely restates the launch's description (a workflow's
  // progress opens with it) or the chip's name — that says nothing new and it
  // is long. An agent reports only what it has spent. The history-loaded agent
  // counts stand in for a workflow the live stream has not described yet.
  let agentsProgress = '';
  if (live?.agents?.length) {
    const finished = live.agents.filter((agent) => agent.state === 'done' || agent.state === 'failed').length;
    const current = findCurrentWorkflowAgent(live.agents);
    agentsProgress = t('workflow.agentsProgress', { finished, count: live.agents.length, defaultValue_one: '{{finished}}/{{count}} agent', defaultValue_other: '{{finished}}/{{count}} agents' });
    if (current) {
      agentsProgress += ` · ${describeWorkflowAgent(current)}`;
    }
  }
  const description = readLaunchDescription(message);
  const summary = live?.summary && live.summary !== description && live.summary !== name ? live.summary : '';
  const progress = agentsProgress
    || summary
    || (live?.usage ? `${live.usage.toolUses} ${live.usage.toolUses === 1 ? 'tool' : 'tools'}` : '')
    || (message.workflow && message.workflow.agentCounts.total > 0
      ? `${message.workflow.agentCounts.completed + message.workflow.agentCounts.failed}/${message.workflow.agentCounts.total}`
      : '');

  return { kind, name, progress };
}

/** Chips fit side by side up to this many; past it, or on a phone, a one-line summary stands in. */
const MAX_INLINE_CHIPS = 2;
const ELAPSED_TICK_MS = 1_000;

function readKind(taskType: string | undefined, t: TFunction): string {
  if (taskType === 'local_workflow') {
    return t('workflow.title', 'Workflow');
  }
  if (taskType === 'local_bash') {
    return t('workflow.backgroundCommand', 'Command');
  }
  return t('workflow.backgroundAgent', 'Agent');
}

function readStartedAt(timestamp: ChatMessage['timestamp']): number | undefined {
  const startedAt = new Date(timestamp).getTime();
  return Number.isFinite(startedAt) ? startedAt : undefined;
}

function collectBackgroundTaskItems(
  { messages, tasks, sessionId, onReveal, onLoadAll }: Omit<BackgroundTasksStripProps, 'sendMessage'>,
  t: TFunction,
): BackgroundTaskItem[] {
  // A loaded row that has a word on its task — settled or not — is the word;
  // a task whose row is not loaded, or is loaded without one (a backgrounded
  // command's launch row from history says nothing until the poll does), is
  // drawn from the map.
  const settledToolIds = new Set(
    messages.filter((message) => readBackgroundTaskStatus(message) !== undefined).map((message) => message.toolId),
  );
  const fromRows = listRunningBackgroundLaunches(messages).map((message): BackgroundTaskItem => {
    const { kind, name, progress } = describeTask(message, t);
    const taskId = readBackgroundTaskId(message);
    return {
      key: message.toolId,
      kind,
      name,
      progress,
      startedAt: readStartedAt(message.timestamp),
      stopFrame: sessionId && taskId ? { type: 'chat.stop-task', sessionId, taskId, toolUseId: message.toolId } : undefined,
      open: () => onReveal(message),
    };
  });
  const fromMap = ownBackgroundTasks(tasks ?? [])
    .filter((task) => !settledToolIds.has(task.toolUseId))
    .map((task): BackgroundTaskItem => ({
      key: task.taskId,
      kind: readKind(task.taskType, t),
      name: task.workflowName ?? task.description,
      progress: '',
      startedAt: task.startedAt,
      stopFrame: sessionId ? { type: 'chat.stop-task', sessionId, taskId: task.taskId, toolUseId: task.toolUseId } : undefined,
      // Launched by one of the session's agents: its row is in that agent's
      // transcript, so no page of this one will ever hold it.
      open: task.nested ? undefined : onLoadAll,
      hint: task.nested
        ? t('workflow.taskOfAgent', 'Launched by one of this session\'s agents')
        : t('workflow.taskRowNotLoaded', 'Launched earlier in this conversation; click to load it'),
    }));
  return [...fromRows, ...fromMap];
}

function StopTaskButton({ item, sendMessage }: { item: BackgroundTaskItem; sendMessage: (message: unknown) => void }) {
  const { t } = useTranslation();
  const { stopFrame } = item;
  if (!stopFrame) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={() => sendMessage(stopFrame)}
      aria-label={t('workflow.stopTask', 'Stop')}
      title={t('workflow.stopTask', 'Stop')}
      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-destructive"
    >
      <X className="h-3 w-3" />
    </button>
  );
}

function RunningDot() {
  return <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-purple-500 dark:bg-purple-400" />;
}

function TaskChip({ item, sendMessage }: { item: BackgroundTaskItem; sendMessage: (message: unknown) => void }) {
  const title = [item.kind, item.name, item.progress, item.hint].filter(Boolean).join(' · ');
  const label = (
    <>
      <RunningDot />
      <span className="flex-shrink-0 font-medium text-foreground">{item.kind}</span>
      {item.name && <span className="min-w-0 truncate">{item.name}</span>}
      {item.progress && <span className="min-w-0 truncate text-muted-foreground/70">· {item.progress}</span>}
    </>
  );
  return (
    <span className="flex min-w-0 max-w-full items-center">
      {item.open ? (
        <button
          type="button"
          onClick={item.open}
          title={title}
          className="flex min-w-0 max-w-xs items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
        >
          {label}
        </button>
      ) : (
        <span title={title} className="flex min-w-0 max-w-xs items-center gap-1.5 rounded px-1.5 py-0.5">
          {label}
        </span>
      )}
      <StopTaskButton item={item} sendMessage={sendMessage} />
    </span>
  );
}

/** The current time, refreshed every second while mounted, so elapsed times keep counting. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ELAPSED_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * The running tasks one per row, with elapsed time and a stop button. Shown
 * by the strip's dropdown and, full height, by the workspace's Background pane.
 */
export function BackgroundTaskList({ items, sendMessage, onOpen, className }: {
  items: BackgroundTaskItem[];
  sendMessage: (message: unknown) => void;
  /** Called before a row opens its task, e.g. to close the dropdown. */
  onOpen?: () => void;
  className?: string;
}) {
  const now = useNow();
  return (
    <ul className={className}>
      {items.map((item) => {
        const { open } = item;
        const detail = item.progress || item.hint;
        const content = (
          <>
            <span className="flex min-w-0 items-center gap-1.5">
              <RunningDot />
              <span className="flex-shrink-0 font-medium">{item.kind}</span>
              {item.name && <span className="min-w-0 truncate text-muted-foreground">{item.name}</span>}
              {item.startedAt !== undefined && (
                <span className="ml-auto flex-shrink-0 pl-2 tabular-nums text-muted-foreground/70">
                  {formatTaskDuration(Math.max(0, now - item.startedAt))}
                </span>
              )}
            </span>
            {detail && <span className="block truncate pl-3 text-[11px] text-muted-foreground/70">{detail}</span>}
          </>
        );
        return (
          <li key={item.key} className="flex items-center gap-1 px-1">
            {open ? (
              <button
                type="button"
                onClick={() => {
                  onOpen?.();
                  open();
                }}
                className="min-w-0 flex-1 rounded px-1.5 py-1.5 text-left hover:bg-muted"
              >
                {content}
              </button>
            ) : (
              <span className="min-w-0 flex-1 px-1.5 py-1.5">{content}</span>
            )}
            <StopTaskButton item={item} sendMessage={sendMessage} />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Rendered by chat's ChatMessagesPane above the transcript: the background
 * tasks — workflows, agents and commands — that are still running. A couple
 * of them fit as chips, each scrolling to its card when clicked and stoppable
 * from its ✕. More than that, or any on a phone (where chips stacked one per
 * line over the transcript), collapse into a one-line count that opens a
 * panel listing each with its elapsed time. Renders nothing while nothing
 * runs, which is most of the time.
 */
export const BackgroundTasksStrip = memo(({ messages, tasks, sessionId, sendMessage, onReveal, onLoadAll }: BackgroundTasksStripProps) => {
  const { t } = useTranslation();
  const { isMobile } = useDeviceSettings({ trackPWA: false });
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const items = collectBackgroundTaskItems({ messages, tasks, sessionId, onReveal, onLoadAll }, t);
  const isSummary = isMobile || items.length > MAX_INLINE_CHIPS;
  const showPanel = isPanelOpen && isSummary && items.length > 0;

  // Read by the workspace's Background pane, which cannot see the transcript.
  useEffect(() => {
    if (sessionId) {
      publishBackgroundTasks(sessionId, { items, sendMessage });
    }
  });
  useEffect(() => () => {
    if (sessionId) {
      publishBackgroundTasks(sessionId, null);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!showPanel) {
      return undefined;
    }
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsPanelOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPanelOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showPanel]);

  if (items.length === 0) {
    return null;
  }

  const surfaceClassName = 'rounded-md border border-border/60 bg-background/95 px-2 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur';
  const ariaLabel = t('workflow.backgroundTasks', 'Background tasks');

  if (!isSummary) {
    return (
      <div role="status" aria-label={ariaLabel} className={`flex max-w-full flex-wrap items-center gap-1.5 ${surfaceClassName}`}>
        {items.map((item) => <TaskChip key={item.key} item={item} sendMessage={sendMessage} />)}
      </div>
    );
  }

  return (
    <div ref={containerRef} role="status" aria-label={ariaLabel} className="relative max-w-full">
      <button
        type="button"
        onClick={() => setIsPanelOpen((open) => !open)}
        aria-expanded={showPanel}
        className={`flex items-center gap-1.5 hover:text-foreground ${surfaceClassName}`}
      >
        <RunningDot />
        <span className="font-medium text-foreground">
          {t('workflow.backgroundSummary', {
            count: items.length,
            defaultValue_one: '{{count}} in background',
            defaultValue_other: '{{count}} in background',
          })}
        </span>
        <ChevronDown className={`h-3 w-3 transition-transform ${showPanel ? 'rotate-180' : ''}`} />
      </button>
      {showPanel && (
        <BackgroundTaskList
          items={items}
          sendMessage={sendMessage}
          onOpen={() => setIsPanelOpen(false)}
          className="absolute left-0 top-full z-20 mt-1 max-h-[60vh] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-border/60 bg-popover py-1 text-xs text-popover-foreground shadow-lg"
        />
      )}
    </div>
  );
});
BackgroundTasksStrip.displayName = 'BackgroundTasksStrip';
