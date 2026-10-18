import { Fragment, useMemo, type ReactNode } from 'react';

type GitDiffViewerProps = {
  diff: string | null;
  isMobile: boolean;
  wrapText: boolean;
  /** Makes each line clickable, e.g. to comment on it; receives the line's index in the diff. */
  onLineClick?: (lineIndex: number) => void;
  /** Drawn under a line, e.g. the comments on it. */
  renderLineExtras?: (lineIndex: number) => ReactNode;
};

const PREVIEW_CHARACTER_LIMIT = 200_000;
const PREVIEW_LINE_LIMIT = 1_500;

type DiffPreview = {
  lines: string[];
  isCharacterTruncated: boolean;
  isLineTruncated: boolean;
};

function buildDiffPreview(diff: string): DiffPreview {
  const isCharacterTruncated = diff.length > PREVIEW_CHARACTER_LIMIT;
  const previewText = isCharacterTruncated ? diff.slice(0, PREVIEW_CHARACTER_LIMIT) : diff;
  const previewLines = previewText.split('\n');
  const isLineTruncated = previewLines.length > PREVIEW_LINE_LIMIT;

  return {
    lines: isLineTruncated ? previewLines.slice(0, PREVIEW_LINE_LIMIT) : previewLines,
    isCharacterTruncated,
    isLineTruncated,
  };
}

/** Rendered by the git panel's changes, compare and history views, and the workspace's Changes pane, to display one file's diff. */
export default function GitDiffViewer({ diff, isMobile, wrapText, onLineClick, renderLineExtras }: GitDiffViewerProps) {
  // Render a bounded preview to keep huge commit diffs from freezing the UI thread.
  const preview = useMemo(() => buildDiffPreview(diff || ''), [diff]);
  const isPreviewTruncated = preview.isCharacterTruncated || preview.isLineTruncated;

  if (!diff) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No diff available
      </div>
    );
  }

  const renderDiffLine = (line: string, index: number) => {
    const isAddition = line.startsWith('+') && !line.startsWith('+++');
    const isDeletion = line.startsWith('-') && !line.startsWith('---');
    const isHeader = line.startsWith('@@');

    const isClickable = Boolean(onLineClick) && !isHeader;
    return (
      <Fragment key={index}>
        <div
          role={isClickable ? 'button' : undefined}
          tabIndex={isClickable ? 0 : undefined}
          onClick={isClickable ? () => onLineClick?.(index) : undefined}
          onKeyDown={isClickable ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onLineClick?.(index);
            }
          } : undefined}
          className={`px-3 py-0.5 font-mono text-xs ${isMobile && wrapText ? 'whitespace-pre-wrap break-all' : 'overflow-x-auto whitespace-pre'
            } ${isAddition ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-300' :
              isDeletion ? 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300' :
                isHeader ? 'bg-primary/5 text-primary' :
                  'text-muted-foreground/70'
            } ${isClickable ? 'cursor-pointer hover:outline hover:outline-1 hover:-outline-offset-1 hover:outline-primary/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary' : ''}`}
        >
          {line}
        </div>
        {renderLineExtras?.(index)}
      </Fragment>
    );
  };

  return (
    <div className="diff-viewer">
      {isPreviewTruncated && (
        <div className="mb-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Large diff preview: rendering is limited to keep the tab responsive.
        </div>
      )}
      {preview.lines.map((line, index) => renderDiffLine(line, index))}
    </div>
  );
}
