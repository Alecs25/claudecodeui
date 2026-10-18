export type DiffLineKind = 'added' | 'deleted' | 'context' | 'hunk' | 'meta';

export type DiffLineInfo = {
  text: string;
  kind: DiffLineKind;
  /** Line number in the old file; null for added lines, hunk headers and metadata. */
  oldLine: number | null;
  /** Line number in the new file; null for deleted lines, hunk headers and metadata. */
  newLine: number | null;
};

export type DiffComment = {
  id: string;
  filePath: string;
  /** Position of the commented line in the file's diff, where the pane draws the comment. */
  lineIndex: number;
  /** The line the comment is on, in the new file, or in the old one for a deleted line. */
  line: number | null;
  lineText: string;
  text: string;
};

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Numbers each line of a unified diff the way an editor gutter would, from its hunk headers. */
export function annotateDiffLines(diff: string): DiffLineInfo[] {
  let oldLine = 0;
  let newLine = 0;
  return diff.split('\n').map((text): DiffLineInfo => {
    const hunk = HUNK_HEADER.exec(text);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      return { text, kind: 'hunk', oldLine: null, newLine: null };
    }
    if (text.startsWith('+++') || text.startsWith('---') || text.startsWith('\\')) {
      return { text, kind: 'meta', oldLine: null, newLine: null };
    }
    if (text.startsWith('+')) {
      return { text, kind: 'added', oldLine: null, newLine: newLine++ };
    }
    if (text.startsWith('-')) {
      return { text, kind: 'deleted', oldLine: oldLine++, newLine: null };
    }
    // Lines before the first hunk (e.g. a directory note) have no position.
    if (newLine === 0 && oldLine === 0) {
      return { text, kind: 'meta', oldLine: null, newLine: null };
    }
    return { text, kind: 'context', oldLine: oldLine++, newLine: newLine++ };
  });
}

/** The line a comment on this diff line refers to: the new file's, or the old one's for a deletion. */
export function commentLineNumber(line: DiffLineInfo): number | null {
  return line.newLine ?? line.oldLine;
}

/**
 * The one chat message "Send to Claude" posts: every comment as file:line,
 * the quoted line and the comment, grouped by file in line order.
 */
export function buildDiffCommentsPrompt(comments: DiffComment[], intro: string): string {
  const ordered = [...comments].sort((left, right) => (
    left.filePath.localeCompare(right.filePath) || (left.line ?? 0) - (right.line ?? 0)
  ));
  const blocks = ordered.map((comment) => {
    const location = comment.line === null ? comment.filePath : `${comment.filePath}:${comment.line}`;
    // The +/- marker says whether the line was added or removed, so it stays.
    const quoted = comment.lineText.trim() ? `> ${comment.lineText}` : null;
    return [`\`${location}\``, quoted, comment.text.trim()].filter(Boolean).join('\n');
  });
  return [intro, ...blocks].join('\n\n');
}
