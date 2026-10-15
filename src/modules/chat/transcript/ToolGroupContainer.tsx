import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';

import type { ChatMessage, ClaudePermissionSuggestion, PermissionGrantResult, LLMProvider,DiffLine,DiffStats,Project,ToolActivityCounts,ToolGroupItem } from '@/shared/types';
import { getToolConfig } from '@/modules/chat/tools';
import { TOOL_ACTIVITY_ORDER } from '@/modules/chat/utils/toolActivity';
import MessageComponent from '@/modules/chat/transcript/MessageComponent';
import { useIsExportingTranscript } from '@/modules/chat/context/TranscriptRenderContext';
import { DiffStatsBadge } from '@/modules/chat/tools/DiffStatsBadge';
import { parseToolPayload, summarizeDiff } from '@/modules/chat/utils/messageTransforms';

type ToolGroupContainerProps = {
  group: ToolGroupItem;
  prevMessage: ChatMessage | null;
  createDiff: (oldStr: string, newStr: string) => DiffLine[];
  getMessageKey: (message: ChatMessage) => string;
  onFileOpen?: (filePath: string, diffInfo?: unknown) => void;
  onShowSettings?: () => void;
  onGrantToolPermission?: (suggestion: ClaudePermissionSuggestion) => PermissionGrantResult | null | undefined;
  showRawParameters?: boolean;
  showThinking?: boolean;
  selectedProject?: Project | null;
  provider: LLMProvider | string;
};

/**
 * Totals the lines the run's file edits added and removed.
 *
 * A collapsed group hides every individual diff behind its summary, so without
 * this the one thing the row could usefully say about a batch of edits — how
 * big it is — is the one thing it did not. A run mixes tools, so only the calls
 * that render a diff are counted; null when none does.
 */
function useGroupDiffStats(
  messages: ChatMessage[],
  createDiff: (oldStr: string, newStr: string) => DiffLine[],
): DiffStats | null {
  return useMemo(() => {
    let added = 0;
    let removed = 0;
    let counted = 0;

    for (const message of messages) {
      const config = getToolConfig(message.toolName || 'UnknownTool').input;
      if (config.contentType !== 'diff' || !config.getContentProps) {
        continue;
      }

      const contentProps = config.getContentProps(parseToolPayload(message.toolInput) ?? {});
      if (typeof contentProps?.oldContent !== 'string' || typeof contentProps?.newContent !== 'string') {
        continue;
      }

      const stats = summarizeDiff(createDiff(contentProps.oldContent, contentProps.newContent));
      added += stats.added;
      removed += stats.removed;
      counted += 1;
    }

    return counted > 0 ? { added, removed } : null;
  }, [createDiff, messages]);
}

function capitalizeFirst(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** "Ran 2 commands, read 3 files" — the kinds in a fixed order, each with its count. */
function useActivitySummary(activity: ToolActivityCounts): string {
  const { t } = useTranslation('chat');
  return useMemo(() => {
    const parts = TOOL_ACTIVITY_ORDER
      .filter((kind) => (activity[kind] ?? 0) > 0)
      .map((kind) => t(`toolSummary.${kind}`, { count: activity[kind] }));
    return capitalizeFirst(parts.join(', '));
  }, [activity, t]);
}

function isRunningToolMessage(message: ChatMessage): boolean {
  if (message.toolStatus === 'in_progress') return true;
  if (message.toolStatus === 'completed' || message.toolStatus === 'failed') return false;
  return !message.toolResult;
}

function isFailedToolMessage(message: ChatMessage): boolean {
  return message.toolStatus === 'failed' || Boolean(message.toolResult?.isError);
}

/**
 * Rendered by chat's ChatMessagesPane to collapse a run of consecutive tool
 * calls into a single expandable summary row, the way Claude's apps show them:
 * one quiet line ("Ran 2 commands, read 3 files") that opens on the calls.
 */
function ToolGroupContainer({
  group,
  prevMessage,
  createDiff,
  getMessageKey,
  onFileOpen,
  onShowSettings,
  onGrantToolPermission,
  showRawParameters,
  showThinking,
  selectedProject,
  provider,
}: ToolGroupContainerProps) {
  const isExporting = useIsExportingTranscript();
  // Collapsed on screen, always open in an export: the whole point of the
  // group row is to hide detail the reader can ask for, and an exported file
  // has no way to ask.
  const [isExpanded, setIsExpanded] = useState(false);
  const showChildren = isExpanded || isExporting;
  const { t } = useTranslation('chat');
  const summary = useActivitySummary(group.activity);
  const groupDiffStats = useGroupDiffStats(group.messages, createDiff);
  const isRunning = group.messages.some(isRunningToolMessage);
  const failedCount = group.messages.filter(isFailedToolMessage).length;

  // Keys only have to be unique among this group's own rows, so repeats of the
  // same key are disambiguated here by occurrence.
  const messageKeys = useMemo(() => {
    const occurrences = new Map<string, number>();
    return group.messages.map((message) => {
      const key = getMessageKey(message);
      const seen = occurrences.get(key) ?? 0;
      occurrences.set(key, seen + 1);
      return seen === 0 ? key : `${key}__${seen}`;
    });
  }, [group.messages, getMessageKey]);

  return (
    <div className="chat-message tool px-3 sm:px-0" data-message-timestamp={group.timestamp || undefined}>
      <button
        type="button"
        className="group/summary flex max-w-full items-center gap-1.5 rounded-md py-0.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setIsExpanded((current) => !current)}
        aria-expanded={isExpanded}
      >
        <span className="min-w-0 truncate">{summary}</span>
        {groupDiffStats && <DiffStatsBadge stats={groupDiffStats} className="flex-shrink-0" />}
        {failedCount > 0 && (
          <span className="flex-shrink-0 text-xs text-red-600 dark:text-red-400">
            {t('toolSummary.failed', { count: failedCount })}
          </span>
        )}
        {isRunning && (
          <span
            className="h-3 w-3 flex-shrink-0 animate-spin rounded-full border-[1.5px] border-muted-foreground/30 border-t-muted-foreground"
            aria-label={t('toolSummary.running')}
          />
        )}
        <ChevronRight
          className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          aria-hidden
        />
      </button>

      {showChildren && (
        <div className="ml-1 mt-1.5 space-y-1.5 border-l border-border/70 pl-3">
          {group.messages.map((message, index) => (
            <MessageComponent
              key={messageKeys[index]}
              message={message}
              prevMessage={index > 0 ? group.messages[index - 1] : prevMessage}
              createDiff={createDiff}
              onFileOpen={onFileOpen}
              onShowSettings={onShowSettings}
              onGrantToolPermission={onGrantToolPermission}
              showRawParameters={showRawParameters}
              showThinking={showThinking}
              selectedProject={selectedProject}
              provider={provider}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Memoized for the transcript re-renders that are not message changes — the
 * pane re-renders when isProcessing or the activity indicator flips, and on
 * every 100ms stream tick, and the group is unchanged then.
 *
 * Bailing out depends on two identities the pane keeps stable on its side:
 * `group`, which groupConsecutiveTools reuses while the run's rows are
 * unchanged, and `getMessageKey`, a module-level function. Adding a prop
 * rebuilt per render here would cost every group on screen a render per tick.
 */
export default memo(ToolGroupContainer);
