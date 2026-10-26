export function normalizeInlineCodeFences(text: string) {
  if (!text || typeof text !== 'string') return text;
  try {
    return text.replace(/```[ \t]*([^\n\r]+?)[ \t]*```/g, '`$1`');
  } catch {
    return text;
  }
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Removes Codex's outer plan transport envelope while preserving its Markdown.
 * The closing tag is optional because streamed plans expose the opening tag
 * before the complete response arrives.
 */
export function stripProposedPlanEnvelope(text: string) {
  if (!text || typeof text !== 'string') return text;

  const openingTag = /^\s*<proposed_plan>[ \t]*(?:\r?\n)?/i;
  if (!openingTag.test(text)) return text;

  const withoutOpeningTag = text.replace(openingTag, '');
  return withoutOpeningTag.replace(/(?:\r?\n)?[ \t]*<\/proposed_plan>\s*$/i, '');
}

export function formatUsageLimitText(text: string) {
  try {
    if (typeof text !== 'string') return text;
    return text.replace(/Claude AI usage limit reached\|(\d{10,13})/g, (match, ts) => {
      let timestampMs = parseInt(ts, 10);
      if (!Number.isFinite(timestampMs)) return match;
      if (timestampMs < 1e12) timestampMs *= 1000;
      const reset = new Date(timestampMs);

      const timeStr = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(reset);

      const offsetMinutesLocal = -reset.getTimezoneOffset();
      const sign = offsetMinutesLocal >= 0 ? '+' : '-';
      const abs = Math.abs(offsetMinutesLocal);
      const offH = Math.floor(abs / 60);
      const offM = abs % 60;
      const gmt = `GMT${sign}${offH}${offM ? ':' + String(offM).padStart(2, '0') : ''}`;
      const tzId = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const cityRaw = tzId.split('/').pop() || '';
      const city = cityRaw
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
      const tzHuman = city ? `${gmt} (${city})` : gmt;

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dateReadable = `${reset.getDate()} ${months[reset.getMonth()]} ${reset.getFullYear()}`;

      return `Claude usage limit reached. Your limit will reset at **${timeStr} ${tzHuman}** - ${dateReadable}`;
    });
  } catch {
    return text;
  }
}

/** A line that opens with a lowercase letter, a `.` or `)`, and text: `a. first`, `b) second`. */
const LETTERED_ITEM_LINE = /^( *)([a-z])[.)] +(\S.*)$/;

/** Cheap bail-out before any line is split: no lettered line, nothing to rewrite. */
const LETTERED_ITEM_CANDIDATE = /^ *[a-z][.)] +\S/m;

/** A fence opener or closer, any indentation. The info string is captured for the backtick rule. */
const FENCE_DELIMITER_LINE = /^\s*(`{3,}|~{3,})(.*)$/;

type OpenFence = { marker: string; length: number };

/** An open lettered level: the last accepted letter at one indentation, nested levels above it. */
type LetteredLevel = { indent: number; letter: string };

/**
 * Rewrites lettered sub-items (`a. text`, `b) text`) into bullet items whose
 * text keeps the letter, so CommonMark nests them under the numbered item
 * instead of gluing them into one paragraph.
 *
 * A line is rewritten only when it continues a lettered sequence: it is `a`,
 * or the previous lettered line at the same indentation was the preceding
 * letter. Deeper lines and blank lines do not end a sequence; any other text
 * at the same or a shallower indentation does. Lines inside code fences are
 * never touched, and CRLF line endings are kept.
 */
export function normalizeLetteredLists(text: string): string {
  if (!text || typeof text !== 'string' || !LETTERED_ITEM_CANDIDATE.test(text)) {
    return text;
  }
  try {
    return rewriteLetteredLines(text.split('\n')).join('\n');
  } catch {
    return text;
  }
}

function rewriteLetteredLines(lines: string[]): string[] {
  const levels: LetteredLevel[] = [];
  let openFence: OpenFence | null = null;

  return lines.map((rawLine) => {
    const ending = rawLine.endsWith('\r') ? '\r' : '';
    const line = ending ? rawLine.slice(0, -1) : rawLine;

    if (openFence) {
      if (closesFence(openFence, line)) {
        openFence = null;
      }
      return rawLine;
    }

    const fence = readFenceOpener(line);
    if (fence) {
      openFence = fence;
      closeLevelsAtOrDeeper(levels, indentationOf(line));
      return rawLine;
    }

    if (line.trim() === '') {
      return rawLine;
    }

    const item = LETTERED_ITEM_LINE.exec(line);
    if (!item) {
      closeLevelsAtOrDeeper(levels, indentationOf(line));
      return rawLine;
    }

    const indent = item[1].length;
    const letter = item[2];
    if (!acceptLetteredItem(levels, indent, letter)) {
      return rawLine;
    }
    return `${item[1]}- ${letter}. ${item[3]}${ending}`;
  });
}

/**
 * Records a lettered line in its sequence and says whether it belongs to one.
 * Only a sequence start (`a`) or the letter right after the previous one is accepted.
 */
function acceptLetteredItem(levels: LetteredLevel[], indent: number, letter: string): boolean {
  closeLevelsDeeperThan(levels, indent);
  const current = levels[levels.length - 1];
  const sameLevel = current?.indent === indent ? current : undefined;
  const continues = sameLevel !== undefined && sameLevel.letter === precedingLetter(letter);

  if (letter !== 'a' && !continues) {
    closeLevelsAtOrDeeper(levels, indent);
    return false;
  }
  if (sameLevel) {
    sameLevel.letter = letter;
  } else {
    levels.push({ indent, letter });
  }
  return true;
}

/** A line of text at `indent` ends every sequence at that depth and deeper. */
function closeLevelsAtOrDeeper(levels: LetteredLevel[], indent: number): void {
  while (levels.length > 0 && levels[levels.length - 1].indent >= indent) {
    levels.pop();
  }
}

/** A line at `indent` leaves deeper sequences behind; sequences at its own depth stay open. */
function closeLevelsDeeperThan(levels: LetteredLevel[], indent: number): void {
  while (levels.length > 0 && levels[levels.length - 1].indent > indent) {
    levels.pop();
  }
}

function precedingLetter(letter: string): string {
  return String.fromCharCode(letter.charCodeAt(0) - 1);
}

function indentationOf(line: string): number {
  return /^[ \t]*/.exec(line)?.[0].length ?? 0;
}

function readFenceOpener(line: string): OpenFence | null {
  const match = FENCE_DELIMITER_LINE.exec(line);
  if (!match) {
    return null;
  }
  const [, sequence, info] = match;
  // A backtick fence cannot carry a backtick in its info string: that is an inline code span.
  if (sequence[0] === '`' && info.includes('`')) {
    return null;
  }
  return { marker: sequence[0], length: sequence.length };
}

function closesFence(fence: OpenFence, line: string): boolean {
  const match = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
  return match !== null && match[1][0] === fence.marker && match[1].length >= fence.length;
}
