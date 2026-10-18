import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, MessageSquare, RefreshCw, Send, Trash2 } from 'lucide-react';

import { api } from '@/shared/api';
import { cn } from '@/shared/utils';
import { GitDiffViewer } from '@/modules/git-panel';
import type { GitChangeSummary } from '@/modules/project-workspace/hooks/useGitChangeSummary';
import {
  annotateDiffLines,
  buildDiffCommentsPrompt,
  commentLineNumber,
  type DiffComment,
} from '@/modules/project-workspace/utils/diffComments';

type ChangesPaneProps = {
  projectId: string;
  changes: GitChangeSummary | null;
  onRefresh: () => void;
  /** Sends the comments as one message; absent when there is no session to send to yet. */
  onSendComments?: (prompt: string) => void;
  isMobile: boolean;
};

type DraftTarget = { filePath: string; lineIndex: number };

let commentCounter = 0;

/** The comment being written under a line; mounted per line, so each starts empty. */
function CommentDraftForm({ isMobile, onSave, onCancel }: {
  isMobile: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const save = () => {
    if (draft.trim()) {
      onSave(draft);
    }
  };
  return (
    <form
      className="space-y-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <textarea
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onCancel();
          }
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            save();
          }
        }}
        rows={2}
        aria-label={t('changesPane.comment', { defaultValue: 'Comment' })}
        className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        // 16px keeps iOS Safari from zooming the viewport on focus.
        style={isMobile ? { fontSize: '16px' } : undefined}
      />
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} className="h-8 rounded-md px-3 text-xs text-muted-foreground hover:bg-accent">
          {t('buttons.cancel', { defaultValue: 'Cancel' })}
        </button>
        <button
          type="submit"
          disabled={!draft.trim()}
          className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {t('changesPane.addComment', { defaultValue: 'Comment' })}
        </button>
      </div>
    </form>
  );
}

function FileDiff({
  projectId,
  filePath,
  isMobile,
  comments,
  draftTarget,
  onLineClick,
  onSaveDraft,
  onCancelDraft,
  onDeleteComment,
}: {
  projectId: string;
  filePath: string;
  isMobile: boolean;
  comments: DiffComment[];
  draftTarget: DraftTarget | null;
  onLineClick: (lineIndex: number, lineText: string, line: number | null) => void;
  onSaveDraft: (text: string) => void;
  onCancelDraft: () => void;
  onDeleteComment: (commentId: string) => void;
}) {
  const { t } = useTranslation();
  // The diff together with the file it is for, so a stale answer never shows.
  const [loaded, setLoaded] = useState<{ filePath: string; diff: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.git.diff(projectId, filePath)
      .then((response) => response.json() as Promise<{ diff?: string; error?: string }>)
      .then((payload) => payload.diff ?? null)
      .catch((error: unknown) => {
        console.warn('[changes pane] Could not load diff:', filePath, error);
        return null;
      })
      .then((nextDiff) => {
        if (!cancelled) {
          setLoaded({ filePath, diff: nextDiff });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, projectId]);

  const diff = loaded?.filePath === filePath ? loaded.diff : null;
  const lines = useMemo(() => annotateDiffLines(diff ?? ''), [diff]);
  const draftLineIndex = draftTarget?.filePath === filePath ? draftTarget.lineIndex : null;

  if (loaded?.filePath !== filePath) {
    return <div className="px-3 py-2 text-xs text-muted-foreground">{t('status.loading', { defaultValue: 'Loading...' })}</div>;
  }

  const renderLineExtras = (lineIndex: number) => {
    const lineComments = comments.filter((comment) => comment.lineIndex === lineIndex);
    const isDrafting = draftLineIndex === lineIndex;
    if (lineComments.length === 0 && !isDrafting) {
      return null;
    }
    return (
      <div className="space-y-1.5 border-y border-border/60 bg-muted/30 px-3 py-2">
        {lineComments.map((comment) => (
          <div key={comment.id} className="flex items-start gap-2 text-xs">
            <MessageSquare className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
            <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-foreground">{comment.text}</p>
            <button
              type="button"
              onClick={() => onDeleteComment(comment.id)}
              aria-label={t('changesPane.deleteComment', { defaultValue: 'Delete comment' })}
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {isDrafting && <CommentDraftForm isMobile={isMobile} onSave={onSaveDraft} onCancel={onCancelDraft} />}
      </div>
    );
  };

  return (
    <GitDiffViewer
      diff={diff}
      isMobile={isMobile}
      wrapText
      onLineClick={(lineIndex) => {
        const line = lines[lineIndex];
        if (line && line.kind !== 'meta' && line.kind !== 'hunk') {
          onLineClick(lineIndex, line.text, commentLineNumber(line));
        }
      }}
      renderLineExtras={renderLineExtras}
    />
  );
}

/**
 * Rendered in the workspace's right pane as "Changes": the project's
 * uncommitted files with their +/- counts, each opening its unified diff.
 * Tapping a line adds a comment under it; "Send to Claude" posts every comment
 * to the session as one message, with file:line and the quoted line.
 */
export default function ChangesPane({ projectId, changes, onRefresh, onSendComments, isMobile }: ChangesPaneProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [comments, setComments] = useState<DiffComment[]>([]);
  const [draftTarget, setDraftTarget] = useState<DraftTarget & { lineText: string; line: number | null } | null>(null);

  // A fresh look at the tree each time the pane opens.
  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  const toggleFile = useCallback((filePath: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (!next.delete(filePath)) {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  const saveDraft = (text: string) => {
    if (!draftTarget) {
      return;
    }
    commentCounter += 1;
    setComments((previous) => [...previous, {
      id: `comment-${commentCounter}`,
      filePath: draftTarget.filePath,
      lineIndex: draftTarget.lineIndex,
      line: draftTarget.line,
      lineText: draftTarget.lineText,
      text: text.trim(),
    }]);
    setDraftTarget(null);
  };

  const sendComments = () => {
    if (!onSendComments || comments.length === 0) {
      return;
    }
    onSendComments(buildDiffCommentsPrompt(
      comments,
      t('changesPane.promptIntro', { defaultValue: 'Comments on the changes:' }),
    ));
    setComments([]);
  };

  const files = changes?.files ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 flex-shrink-0 items-center gap-2 border-b border-border/60 px-3 text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">
          <span className="text-green-600 dark:text-green-400">+{changes?.added ?? 0}</span>{' '}
          <span className="text-red-600 dark:text-red-400">−{changes?.deleted ?? 0}</span>
        </span>
        <span className="min-w-0 flex-1 truncate">
          {t('changesPane.fileCount', { count: files.length, defaultValue_one: '{{count}} file', defaultValue_other: '{{count}} files' })}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          aria-label={t('buttons.refresh', { defaultValue: 'Refresh' })}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {files.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">
            {t('changesPane.empty', { defaultValue: 'No changes' })}
          </p>
        )}
        {files.map((file) => {
          const isOpen = expanded.has(file.path);
          const fileComments = comments.filter((comment) => comment.filePath === file.path);
          return (
            <section key={file.path} className="border-b border-border/60">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggleFile(file.path)}
                className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-xs hover:bg-accent/50"
              >
                <ChevronRight className={cn('h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
                <span className="min-w-0 flex-1 truncate font-mono text-foreground" title={file.path}>{file.path}</span>
                {fileComments.length > 0 && (
                  <span className="flex items-center gap-0.5 text-primary">
                    <MessageSquare className="h-3 w-3" />
                    {fileComments.length}
                  </span>
                )}
                <span className="flex-shrink-0 font-mono tabular-nums">
                  {file.added !== null && file.added > 0 && <span className="text-green-600 dark:text-green-400">+{file.added}</span>}
                  {file.deleted !== null && file.deleted > 0 && <span className="ml-1 text-red-600 dark:text-red-400">−{file.deleted}</span>}
                  {file.added === null && <span className="text-muted-foreground">bin</span>}
                </span>
              </button>
              {isOpen && (
                <FileDiff
                  projectId={projectId}
                  filePath={file.path}
                  isMobile={isMobile}
                  comments={fileComments}
                  draftTarget={draftTarget}
                  onLineClick={(lineIndex, lineText, line) => setDraftTarget({ filePath: file.path, lineIndex, lineText, line })}
                  onSaveDraft={saveDraft}
                  onCancelDraft={() => setDraftTarget(null)}
                  onDeleteComment={(commentId) => setComments((previous) => previous.filter((comment) => comment.id !== commentId))}
                />
              )}
            </section>
          );
        })}
      </div>

      {comments.length > 0 && (
        <div className="flex flex-shrink-0 items-center gap-2 border-t border-border/60 px-3 py-2">
          <span className="min-w-0 flex-1 text-xs text-muted-foreground">
            {t('changesPane.commentCount', { count: comments.length, defaultValue_one: '{{count}} comment', defaultValue_other: '{{count}} comments' })}
          </span>
          <button
            type="button"
            onClick={sendComments}
            disabled={!onSendComments}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {t('changesPane.send', { defaultValue: 'Send to Claude' })}
          </button>
        </div>
      )}
    </div>
  );
}
