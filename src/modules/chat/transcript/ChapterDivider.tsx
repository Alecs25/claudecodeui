import { memo } from 'react';

type ChapterDividerProps = {
  anchorId: string;
  title: string;
  summary?: string;
};

/**
 * Rendered by chat's MessageComponent in place of a mark_chapter tool row: a
 * quiet rule with the chapter title, which the chapters menu scrolls to.
 */
function ChapterDivider({ anchorId, title, summary }: ChapterDividerProps) {
  return (
    <div id={anchorId} className="scroll-mt-14 py-2" role="separator" aria-label={title}>
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="max-w-[70%] truncate text-xs font-medium uppercase tracking-wide text-muted-foreground" title={title}>
          {title}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      {summary && (
        <p className="mt-1 truncate text-center text-xs text-muted-foreground/80" title={summary}>
          {summary}
        </p>
      )}
    </div>
  );
}

export default memo(ChapterDivider);
