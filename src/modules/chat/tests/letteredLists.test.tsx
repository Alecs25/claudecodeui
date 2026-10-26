import assert from 'node:assert/strict';

import { render } from '@testing-library/react';
import { test, vi } from 'vitest';
import React from 'react';

import { normalizeLetteredLists } from '@/modules/chat/utils/chatFormatting';
import { splitStreamingMarkdown } from '@/modules/chat/utils/streamingMarkdown';

/**
 * Lettered sub-items (`a. text`) are not CommonMark lists: without a rewrite,
 * each line is a lazy continuation and the items collapse into one paragraph.
 * These pin the rewrite itself and the nested structure the chat renders.
 */

vi.mock('@/modules/command-palette', () => ({
  usePaletteOps: () => ({ openFileInEditor: vi.fn(), openDirectory: vi.fn() }),
}));

const { Markdown } = await import('@/modules/chat/transcript/Markdown');

const REPORTED_SAMPLE = [
  '1. **Fatto**',
  '   a. first thing done',
  '   b. second thing:',
  '      - bullet one',
  '      - bullet two',
  '   c. third thing',
  '2. **Da decidere**',
  '   a. choice',
].join('\n');

const itemByText = (container: HTMLElement, startsWith: string): HTMLLIElement => {
  const match = Array.from(container.querySelectorAll('li')).find((item) =>
    (item.textContent ?? '').trim().startsWith(startsWith),
  );
  assert.ok(match, `no list item starts with "${startsWith}"`);
  return match;
};

test('a lettered sub-item sequence becomes bullet items that keep their letters', () => {
  assert.equal(
    normalizeLetteredLists('1. **Fatto**\n   a. first\n   b. second\n   c. third'),
    '1. **Fatto**\n   - a. first\n   - b. second\n   - c. third',
  );
});

test('the reported sample rewrites only the lettered lines, not the bullets under them', () => {
  assert.equal(
    normalizeLetteredLists(REPORTED_SAMPLE),
    [
      '1. **Fatto**',
      '   - a. first thing done',
      '   - b. second thing:',
      '      - bullet one',
      '      - bullet two',
      '   - c. third thing',
      '2. **Da decidere**',
      '   - a. choice',
    ].join('\n'),
  );
});

test('a) style labels are rewritten to the same a. form', () => {
  assert.equal(normalizeLetteredLists('a) one\nb) two'), '- a. one\n- b. two');
});

test('a sequence may skip blank lines and deeper-indented lines', () => {
  assert.equal(
    normalizeLetteredLists('a. one\n\n   - sub\nb. two'),
    '- a. one\n\n   - sub\n- b. two',
  );
});

test('text at the same depth ends a sequence, so a later letter is left alone', () => {
  assert.equal(normalizeLetteredLists('a. one\nsome paragraph\nb. two'), '- a. one\nsome paragraph\nb. two');
});

test('a sequence must start at a, so a lone letter stays text', () => {
  assert.equal(normalizeLetteredLists('b. second\nc. third'), 'b. second\nc. third');
});

test('lines inside a backtick fence are untouched', () => {
  const source = '```\na. not a list\nb. still code\n```\na. outside';
  assert.equal(normalizeLetteredLists(source), '```\na. not a list\nb. still code\n```\n- a. outside');
});

test('lines inside a tilde fence are untouched, even when indented', () => {
  const source = '  ~~~text\n  a. quoted\n  b. quoted\n  ~~~';
  assert.equal(normalizeLetteredLists(source), source);
});

test('"e. g." in running text is untouched', () => {
  const source = 'Use a tool, e. g. the reader, for this.';
  assert.equal(normalizeLetteredLists(source), source);
});

test('a lone "e. g." or "i. e." line with no a. before it is untouched', () => {
  assert.equal(normalizeLetteredLists('e. g. something'), 'e. g. something');
  assert.equal(normalizeLetteredLists('i. e. the rest'), 'i. e. the rest');
});

test('CRLF line endings are kept on every rewritten and untouched line', () => {
  assert.equal(
    normalizeLetteredLists('1. **Fatto**\r\n   a. one\r\n   b. two\r\n\r\nEnd.\r\n'),
    '1. **Fatto**\r\n   - a. one\r\n   - b. two\r\n\r\nEnd.\r\n',
  );
});

test('text without a lettered line is returned as is', () => {
  const source = 'Plain text with a. mid-line and no list.';
  assert.equal(normalizeLetteredLists(source), source);
});

test('the reported sample renders each lettered item as its own list item under its number', () => {
  const { container } = render(<Markdown>{REPORTED_SAMPLE}</Markdown>);

  const first = itemByText(container, 'a. first thing done');
  const second = itemByText(container, 'b. second thing:');
  const third = itemByText(container, 'c. third thing');
  const choice = itemByText(container, 'a. choice');
  const bulletTwo = itemByText(container, 'bullet two');

  assert.ok(first && second && third && choice);
  assert.equal(second.querySelectorAll(':scope > ul > li').length, 2, 'the two bullets nest under b.');
  assert.equal(bulletTwo.querySelector('li'), null);
  assert.ok(!bulletTwo.textContent?.includes('c. third thing'), 'c. must not be inside "bullet two"');

  const numberedItem = third.closest('ol > li');
  assert.ok(numberedItem, 'the lettered items sit inside the numbered item');
  assert.equal(numberedItem.textContent?.trim().startsWith('Fatto'), true);
});

test('a lettered list renders without bullets and keeps its nesting class', () => {
  const { container } = render(<Markdown>{REPORTED_SAMPLE}</Markdown>);

  const letteredList = itemByText(container, 'a. first thing done').parentElement;
  assert.ok(letteredList instanceof HTMLUListElement);
  assert.ok(letteredList.classList.contains('lettered-list'));
  assert.ok(letteredList.classList.contains('list-none'));
  assert.ok(!letteredList.classList.contains('list-disc'));
});

test('an ordinary bullet list keeps its disc markers', () => {
  const { container } = render(<Markdown>{'- alpha\n- beta'}</Markdown>);

  const list = itemByText(container, 'alpha').parentElement;
  assert.ok(list instanceof HTMLUListElement);
  assert.ok(!list.classList.contains('lettered-list'));
  assert.ok(list.classList.contains('list-disc'));
});

test('"e. g." in a paragraph renders as text, not as a list', () => {
  const { container } = render(<Markdown>{'Use a tool, e. g. the reader, for this.'}</Markdown>);

  assert.equal(container.querySelectorAll('li').length, 0);
  assert.ok(container.textContent?.includes('e. g. the reader'));
});

test('the streaming split keeps lettered items in one half, so the sequence renders whole', () => {
  const { settled, pending } = splitStreamingMarkdown('Options:\n\na. one\n\nb. two\n\nMore text');

  assert.ok(pending.includes('a. one') && pending.includes('b. two'), `split cut the sequence: ${JSON.stringify({ settled, pending })}`);
});
