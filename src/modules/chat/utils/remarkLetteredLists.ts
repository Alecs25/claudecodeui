/**
 * Marks the unordered lists whose items all open with a lettered label
 * (`a. text`, `b) text`), as written by normalizeLetteredLists. The letter is
 * already the item's marker, so the list gets the `lettered-list` class and the
 * renderer drops the bullet dot.
 */

/** The LETTERED_ITEM_LINE label at the start of an item's first text node. */
const LETTERED_LABEL_START = /^[a-z][.)]\s/;

/** The subset of the mdast node shape this plugin reads and writes. */
type MarkdownNode = {
  type: string;
  ordered?: boolean;
  value?: string;
  children?: MarkdownNode[];
  data?: { hProperties?: Record<string, unknown>; [key: string]: unknown };
};

export const LETTERED_LIST_CLASS = 'lettered-list';

function startsWithLetteredLabel(item: MarkdownNode): boolean {
  const [firstBlock] = item.children ?? [];
  if (firstBlock?.type !== 'paragraph') {
    return false;
  }
  const [firstText] = firstBlock.children ?? [];
  return firstText?.type === 'text' && LETTERED_LABEL_START.test(firstText.value ?? '');
}

function isLetteredList(node: MarkdownNode): boolean {
  const items = node.children ?? [];
  return node.type === 'list' && node.ordered === false && items.length > 0 && items.every(startsWithLetteredLabel);
}

function markLetteredLists(node: MarkdownNode): void {
  if (isLetteredList(node)) {
    node.data = {
      ...node.data,
      hProperties: { ...node.data?.hProperties, className: [LETTERED_LIST_CLASS] },
    };
  }
  for (const child of node.children ?? []) {
    markLetteredLists(child);
  }
}

export function remarkLetteredLists() {
  return (tree: MarkdownNode) => {
    markLetteredLists(tree);
  };
}
