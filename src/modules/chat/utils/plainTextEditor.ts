/**
 * DOM model of the touch composer's plain-text contenteditable.
 *
 * Canonical form: one text node holding the whole value, newlines as `\n`
 * (the editor is `white-space: pre-wrap`), followed by a single `<br>`. The
 * trailing `<br>` gives a value that ends in `\n` its last, empty line and an
 * empty editor a caret line; it is never part of the value. String offsets
 * then map one to one onto the text node.
 *
 * Browsers and keyboards still write their own markup into a contenteditable
 * (`<div>`/`<p>` per line, `<br>`, `<b>`, `<span style>`, `<img>`), so the
 * value is always read with `readEditorText`, which understands those shapes,
 * and the DOM is put back into canonical form after each edit.
 */

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE',
  'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P',
  'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
]);

/** Elements whose content is never text the user typed. */
const SKIPPED_TAGS = new Set(['IMG', 'PICTURE', 'VIDEO', 'AUDIO', 'SCRIPT', 'STYLE', 'TEMPLATE', 'SVG', 'OBJECT', 'IFRAME']);

const NBSP = / /g;

const isElement = (node: Node): node is Element => node.nodeType === Node.ELEMENT_NODE;
const isText = (node: Node): node is Text => node.nodeType === Node.TEXT_NODE;
const isBlock = (node: Node) => isElement(node) && BLOCK_TAGS.has(node.tagName.toUpperCase());

const isEmptyText = (node: Node) => isText(node) && node.data.length === 0;

/**
 * A `<br>` that closes its line box without starting a new one: the last thing
 * in its block (or in the editor). Browsers add it so an empty line keeps its
 * height; it is not a newline of the value.
 */
const isTrailingBreak = (br: Node, root: Node): boolean => {
  let current: Node = br;
  while (current !== root && !isBlock(current)) {
    let sibling = current.nextSibling;
    while (sibling && isEmptyText(sibling)) {
      sibling = sibling.nextSibling;
    }
    if (sibling) {
      return false;
    }
    if (!current.parentNode) {
      return true;
    }
    current = current.parentNode;
  }
  return true;
};

type DomPoint = { node: Node; offset: number };

type Walk = {
  text: string;
  lineStarted: boolean;
  breakPending: boolean;
  points: DomPoint[];
  offsets: number[];
};

const flushBreak = (walk: Walk) => {
  if (walk.breakPending) {
    walk.text += '\n';
    walk.breakPending = false;
  }
};

const recordPoint = (walk: Walk, node: Node, offset: number, textOffset: number) => {
  walk.points.forEach((point, index) => {
    if (point.node === node && point.offset === offset) {
      walk.offsets[index] = textOffset;
    }
  });
};

const walkNode = (node: Node, root: Node, walk: Walk) => {
  if (isText(node)) {
    if (node.data.length > 0) {
      flushBreak(walk);
    }
    const start = walk.text.length;
    walk.points.forEach((point, index) => {
      if (point.node === node) {
        walk.offsets[index] = start + Math.min(point.offset, node.data.length);
      }
    });
    if (node.data.length > 0) {
      walk.text += node.data.replace(NBSP, ' ');
      walk.lineStarted = true;
    }
    return;
  }

  if (!isElement(node)) {
    return;
  }

  const tag = node.tagName.toUpperCase();
  if (SKIPPED_TAGS.has(tag)) {
    return;
  }
  if (tag === 'BR') {
    if (!isTrailingBreak(node, root)) {
      flushBreak(walk);
      walk.text += '\n';
      walk.lineStarted = true;
    }
    return;
  }

  const block = node !== root && isBlock(node);
  if (block && (walk.lineStarted || walk.breakPending)) {
    walk.breakPending = true;
    walk.lineStarted = false;
  }

  const children = Array.from(node.childNodes);
  children.forEach((child, index) => {
    recordPoint(walk, node, index, walk.text.length + (walk.breakPending ? 1 : 0));
    walkNode(child, root, walk);
  });
  recordPoint(walk, node, children.length, walk.text.length + (walk.breakPending ? 1 : 0));

  if (block) {
    if (!walk.lineStarted) {
      // An empty block is still a line of its own.
      flushBreak(walk);
    }
    walk.breakPending = true;
    walk.lineStarted = false;
  }
};

const runWalk = (root: Node, points: DomPoint[] = []) => {
  const walk: Walk = { text: '', lineStarted: false, breakPending: false, points, offsets: points.map(() => -1) };
  walkNode(root, root, walk);
  return walk;
};

/** The plain-text value of the editor, whatever markup the browser left in it. */
export const readEditorText = (root: Node): string => runWalk(root).text;

/** True when the editor holds exactly the canonical DOM for `text`. */
export const isCanonicalEditorDom = (root: Element, text: string): boolean => {
  const nodes = root.childNodes;
  const trailing = nodes[nodes.length - 1];
  if (!trailing || !isElement(trailing) || trailing.tagName !== 'BR' || trailing.attributes.length > 0) {
    return false;
  }
  if (text === '') {
    return nodes.length === 1;
  }
  return nodes.length === 2 && isText(nodes[0]) && nodes[0].data === text;
};

/** Replaces the editor's content with the canonical DOM for `text`. */
export const renderEditorText = (root: Element, text: string) => {
  const documentRef = root.ownerDocument;
  const nodes: Node[] = [];
  if (text) {
    nodes.push(documentRef.createTextNode(text));
  }
  nodes.push(documentRef.createElement('br'));
  root.replaceChildren(...nodes);
};

/**
 * Fixes the small deviations typing leaves (split text nodes, a missing
 * trailing `<br>`) in place, so the browser keeps its own caret and the
 * keyboard its state. Returns false when only a full re-render will do.
 */
export const repairEditorDom = (root: Element, text: string): boolean => {
  root.normalize();
  if (isCanonicalEditorDom(root, text)) {
    return true;
  }
  const nodes = root.childNodes;
  const onlyText = nodes.length === 1 && isText(nodes[0]) && nodes[0].data === text;
  if ((text === '' && nodes.length === 0) || (text !== '' && onlyText)) {
    root.appendChild(root.ownerDocument.createElement('br'));
    return true;
  }
  return false;
};

/** String offset of a DOM position inside the editor, or -1 when it lies outside. */
export const domPointToOffset = (root: Node, node: Node, offset: number): number => {
  if (node !== root && !root.contains(node)) {
    return -1;
  }
  const walk = runWalk(root, [{ node, offset }]);
  const result = walk.offsets[0];
  return result < 0 ? walk.text.length : Math.min(result, walk.text.length);
};

/** DOM position of a string offset; the editor must be in canonical form. */
export const offsetToDomPoint = (root: Element, offset: number): DomPoint => {
  const first = root.firstChild;
  if (first && isText(first)) {
    return { node: first, offset: Math.max(0, Math.min(offset, first.data.length)) };
  }
  return { node: root, offset: 0 };
};

export type EditorSelection = { start: number; end: number };

/** The document selection as string offsets, or null when it is not inside the editor. */
export const readEditorSelection = (root: Element): EditorSelection | null => {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }
  const start = domPointToOffset(root, range.startContainer, range.startOffset);
  const end = domPointToOffset(root, range.endContainer, range.endOffset);
  return { start: Math.min(start, end), end: Math.max(start, end) };
};

/** Selects the string range [start, end) in a canonical editor. */
export const writeEditorSelection = (root: Element, start: number, end: number) => {
  const selection = root.ownerDocument.getSelection();
  if (!selection) {
    return;
  }
  const from = offsetToDomPoint(root, start);
  const to = offsetToDomPoint(root, end);
  const range = root.ownerDocument.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  selection.removeAllRanges();
  selection.addRange(range);
};

/**
 * Scrolls the editor so the caret is visible. A textarea does this by itself
 * after a paste or a programmatic caret move; a contenteditable does not.
 */
export const scrollSelectionIntoView = (root: HTMLElement) => {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }
  const range = selection.getRangeAt(0);
  if (typeof range.getBoundingClientRect !== 'function') {
    return;
  }
  const caret = range.getBoundingClientRect();
  if (caret.top === 0 && caret.bottom === 0) {
    return;
  }
  const box = root.getBoundingClientRect();
  if (caret.bottom > box.bottom) {
    root.scrollTop += caret.bottom - box.bottom;
  } else if (caret.top < box.top) {
    root.scrollTop -= box.top - caret.top;
  }
};

/**
 * Removes the images a keyboard or browser inserted into the editor and
 * returns their sources, so the caller can try to turn them into attachments.
 */
export const takeEditorImages = (root: Element): string[] => {
  const images = Array.from(root.querySelectorAll('img, picture, video, svg, object, iframe'));
  const sources = images
    .map((element) => (element.tagName.toUpperCase() === 'IMG' ? (element as HTMLImageElement).getAttribute('src') ?? '' : ''))
    .filter(Boolean);
  images.forEach((element) => element.remove());
  return sources;
};

/** Plain text of a DataTransfer, with Windows line endings folded into `\n`. */
export const readTransferText = (transfer: DataTransfer | null): string =>
  (transfer?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n');

/** Image files carried by a paste or drop, from `files` or, failing that, from `items`. */
export const readTransferImages = (transfer: DataTransfer | null): File[] => {
  if (!transfer) {
    return [];
  }
  const fromFiles = Array.from(transfer.files ?? []).filter((file) => file.type.startsWith('image/'));
  if (fromFiles.length > 0) {
    return fromFiles;
  }
  return Array.from(transfer.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
};

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/**
 * Turns the source of an image a keyboard inserted into a file. Only `data:`
 * and `blob:` sources are read: anything else would be a network request the
 * user never asked for.
 */
export async function imageSourceToFile(source: string, now: () => number = Date.now): Promise<File | null> {
  if (!/^(data:image\/|blob:)/i.test(source)) {
    return null;
  }
  try {
    const response = await fetch(source);
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) {
      return null;
    }
    const extension = EXTENSION_BY_TYPE[blob.type] ?? 'png';
    return new File([blob], `tastiera-${now()}.${extension}`, { type: blob.type });
  } catch (error) {
    console.warn('Could not read the image inserted by the keyboard:', error);
    return null;
  }
}
