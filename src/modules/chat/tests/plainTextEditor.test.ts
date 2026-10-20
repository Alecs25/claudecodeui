import assert from 'node:assert/strict';

import { afterEach, test } from 'vitest';

import {
  domPointToOffset,
  isCanonicalEditorDom,
  readEditorSelection,
  readEditorText,
  readTransferImages,
  renderEditorText,
  repairEditorDom,
  takeEditorImages,
  writeEditorSelection,
} from '@/modules/chat/utils/plainTextEditor';

/**
 * The touch composer is a contenteditable whose value is a plain string. The
 * browser and the keyboard write their own markup into it; these helpers read
 * the string back out of any of those shapes and map carets both ways.
 */

const editorWith = (html: string) => {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
};

afterEach(() => {
  document.body.replaceChildren();
});

test('the canonical DOM is one text node plus a trailing <br>, and reads back unchanged', () => {
  const root = editorWith('');
  for (const value of ['', 'hello', 'one\ntwo', 'ends with newline\n', '\n\n']) {
    renderEditorText(root, value);
    assert.equal(readEditorText(root), value);
    assert.equal(isCanonicalEditorDom(root, value), true);
  }
  renderEditorText(root, 'a\nb');
  assert.equal(root.innerHTML, 'a\nb<br>');
});

test('Chrome line blocks, <br>s and empty lines read as \\n', () => {
  assert.equal(readEditorText(editorWith('line1<div>line2</div><div><br></div>')), 'line1\nline2\n');
  assert.equal(readEditorText(editorWith('<div>a</div><div>b</div>')), 'a\nb');
  assert.equal(readEditorText(editorWith('<div><br></div><div>b</div>')), '\nb');
  assert.equal(readEditorText(editorWith('a<div><br></div><div>b</div>')), 'a\n\nb');
  assert.equal(readEditorText(editorWith('<p>a</p><p>b</p>')), 'a\nb');
  assert.equal(readEditorText(editorWith('abc<br><br>')), 'abc\n');
  assert.equal(readEditorText(editorWith('abc<br>')), 'abc');
  assert.equal(readEditorText(editorWith('a<br>b')), 'a\nb');
});

test('formatting, pasted HTML and images leave only their text', () => {
  assert.equal(
    readEditorText(editorWith('<b>bold</b> <span style="color:red">red</span>&nbsp;<i>x</i>')),
    'bold red x',
  );
  assert.equal(readEditorText(editorWith('see <img src="data:image/png;base64,AAAA"> this')), 'see  this');
  assert.equal(readEditorText(editorWith('<style>p{}</style><script>alert(1)</script>ok')), 'ok');
});

test('DOM positions map to string offsets across newlines and blocks', () => {
  const root = editorWith('');
  renderEditorText(root, 'ab\ncd');
  const text = root.firstChild as Text;
  assert.equal(domPointToOffset(root, text, 0), 0);
  assert.equal(domPointToOffset(root, text, 4), 4);
  assert.equal(domPointToOffset(root, root, 1), 5);

  const blocks = editorWith('ab<div>cd</div>');
  const secondLine = blocks.querySelector('div')!.firstChild as Text;
  assert.equal(domPointToOffset(blocks, secondLine, 1), 4);
  assert.equal(domPointToOffset(blocks, blocks.querySelector('div')!, 0), 3);
  assert.equal(domPointToOffset(blocks, document.body, 0), -1);
});

test('a selection written as offsets reads back as the same offsets', () => {
  const root = editorWith('');
  renderEditorText(root, 'first\nsecond\n');
  writeEditorSelection(root, 3, 9);
  assert.deepEqual(readEditorSelection(root), { start: 3, end: 9 });
  writeEditorSelection(root, 13, 13);
  assert.deepEqual(readEditorSelection(root), { start: 13, end: 13 });
  writeEditorSelection(root, 99, 99);
  assert.deepEqual(readEditorSelection(root), { start: 13, end: 13 });
});

test('split text nodes and a lost <br> are repaired in place, anything else is not', () => {
  const split = editorWith('');
  split.append(document.createTextNode('ab'), document.createTextNode('c'));
  assert.equal(repairEditorDom(split, 'abc'), true);
  assert.equal(split.innerHTML, 'abc<br>');

  const blocks = editorWith('a<div>b</div>');
  assert.equal(repairEditorDom(blocks, readEditorText(blocks)), false);
});

test('images are pulled out of the editor with their sources', () => {
  const root = editorWith('x<img src="blob:http://localhost/1"><span><img src="data:image/gif;base64,R0"></span>y');
  assert.deepEqual(takeEditorImages(root), ['blob:http://localhost/1', 'data:image/gif;base64,R0']);
  assert.equal(root.querySelector('img'), null);
  assert.equal(readEditorText(root), 'xy');
});

test('image files come from a transfer\'s files, or from its items', () => {
  const png = new File(['p'], 'shot.png', { type: 'image/png' });
  const pdf = new File(['d'], 'doc.pdf', { type: 'application/pdf' });
  const fromFiles = { files: [png, pdf], items: [] } as unknown as DataTransfer;
  assert.deepEqual(readTransferImages(fromFiles), [png]);

  const fromItems = {
    files: [],
    items: [
      { kind: 'string', type: 'text/plain', getAsFile: () => null },
      { kind: 'file', type: 'image/png', getAsFile: () => png },
    ],
  } as unknown as DataTransfer;
  assert.deepEqual(readTransferImages(fromItems), [png]);
  assert.deepEqual(readTransferImages(null), []);
});
