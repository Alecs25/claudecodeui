import assert from 'node:assert/strict';

import { act, fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';
import type { ChangeEvent, ClipboardEvent, KeyboardEvent, RefObject } from 'react';
import { afterEach, beforeEach, test, vi } from 'vitest';

import type { Project } from '@/shared/types';
import type { TextareaLikeElement } from '@/modules/chat/composer/PromptInputEditable';

/**
 * The touch composer is a plain-text contenteditable so Android keyboards
 * offer it their clipboard images. To the composer hooks it must still look
 * like the textarea: same `value`/selection surface on the ref, same
 * onChange/onKeyDown/onPaste contract. These tests drive the real slash
 * command, file mention and history hooks through it.
 */

const jsonResponse = (payload: unknown) => ({ ok: true, json: async () => payload });
const listCommands = vi.fn();
const listSkills = vi.fn();
const getFiles = vi.fn();

vi.mock('@/shared/api', () => ({
  api: {
    commands: { list: (...args: unknown[]) => listCommands(...args) },
    providers: { skills: (...args: unknown[]) => listSkills(...args) },
    getFiles: (...args: unknown[]) => getFiles(...args),
  },
}));

const { PromptInputEditable } = await import('@/modules/chat/composer/PromptInputEditable');
const { useSlashCommands } = await import('@/modules/chat/hooks/useSlashCommands');
const { useFileMentions } = await import('@/modules/chat/hooks/useFileMentions');
const { useInputHistory } = await import('@/modules/chat/hooks/useInputHistory');

const ROOT = '/home/user/project';
const project: Project = { projectId: 'p1', displayName: 'project', fullPath: ROOT };

type HarnessState = {
  showCommandMenu: boolean;
  showFileDropdown: boolean;
  filteredFiles: string[];
  changes: string[];
  pastedImages: File[];
  recordSent: (text: string) => void;
};

/** The composer wiring, reduced to the hooks that read the editor through textareaRef. */
function Harness({ state, initial = '' }: { state: HarnessState; initial?: string }) {
  const [input, setInput] = React.useState(initial);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const slash = useSlashCommands({
    selectedProject: project,
    provider: 'claude',
    input,
    setInput,
    textareaRef,
    onExecuteCommand: () => {},
  });
  const mentions = useFileMentions({ selectedProject: project, input, setInput, textareaRef });
  const history = useInputHistory({ setInput, textareaRef, scope: 'session-1' });

  React.useEffect(() => {
    Object.assign(state, {
      showCommandMenu: slash.showCommandMenu,
      showFileDropdown: mentions.showFileDropdown,
      filteredFiles: mentions.filteredFiles.map((file) => file.name),
      recordSent: history.recordSentMessage,
    });
  });

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    state.changes.push(value);
    setInput(value);
    mentions.setCursorPosition(event.target.selectionStart);
    slash.handleCommandInputChange(value, event.target.selectionStart);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slash.handleCommandMenuKeyDown(event) || mentions.handleFileMentionsKeyDown(event)) {
      return;
    }
    history.handleHistoryKeyDown(event);
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    Array.from(event.clipboardData.items).forEach((item) => {
      const file = item.type.startsWith('image/') ? item.getAsFile() : null;
      if (file) {
        state.pastedImages.push(file);
      }
    });
  };

  return (
    <PromptInputEditable
      ref={textareaRef as unknown as RefObject<TextareaLikeElement>}
      value={input}
      placeholder="Message"
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    />
  );
}

const newState = (): HarnessState => ({
  showCommandMenu: false,
  showFileDropdown: false,
  filteredFiles: [],
  changes: [],
  pastedImages: [],
  recordSent: () => {},
});

const renderEditor = (initial = '') => {
  const state = newState();
  const view = render(<Harness state={state} initial={initial} />);
  const editor = view.getByRole('textbox') as TextareaLikeElement;
  return { state, editor, view };
};

/** Types the way a browser does: edits the text node at the caret, then fires input. */
const typeText = (editor: TextareaLikeElement, text: string) => {
  act(() => {
    editor.focus();
    const value = editor.value;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const next = `${value.slice(0, start)}${text}${value.slice(end)}`;
    let node = editor.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      node = document.createTextNode('');
      editor.insertBefore(node, editor.firstChild);
    }
    (node as Text).data = next;
    const range = document.createRange();
    range.setStart(node, start + text.length);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    fireEvent.input(editor);
  });
};

const beforeInput = (editor: HTMLElement, inputType: string, dataTransfer: unknown = null) => {
  const event = new Event('beforeinput', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'inputType', { value: inputType });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  act(() => {
    editor.dispatchEvent(event);
  });
  return event;
};

const transfer = ({ text = '', html = '', files = [] as File[] }) => ({
  files,
  items: [
    ...files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
    ...(text ? [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] : []),
  ],
  types: [...(text ? ['text/plain'] : []), ...(html ? ['text/html'] : []), ...(files.length ? ['Files'] : [])],
  getData: (type: string) => (type === 'text/plain' ? text : type === 'text/html' ? html : ''),
});

beforeEach(() => {
  localStorage.clear();
  listCommands.mockReset();
  listSkills.mockReset();
  getFiles.mockReset();
  listCommands.mockResolvedValue(jsonResponse({
    builtIn: [{ name: '/help', description: 'Show help', namespace: 'builtin' }],
    custom: [{ name: '/firewall-reload', description: 'Reload', namespace: 'project', path: 'x.md' }],
  }));
  listSkills.mockResolvedValue(jsonResponse({ success: true, data: { skills: [] } }));
  getFiles.mockResolvedValue(jsonResponse([{ type: 'file', name: 'notes.md', path: `${ROOT}/notes.md` }]));
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 0;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('the ref exposes value and selection like a textarea, newlines included', () => {
  const { editor } = renderEditor('one\ntwo\n');
  assert.equal(editor.value, 'one\ntwo\n');
  assert.equal(editor.getAttribute('contenteditable'), 'true');
  assert.equal(editor.getAttribute('aria-multiline'), 'true');

  act(() => {
    editor.focus();
    editor.setSelectionRange(4, 7);
  });
  assert.equal(editor.selectionStart, 4);
  assert.equal(editor.selectionEnd, 7);
  assert.equal(document.getSelection()!.toString(), 'two');

  act(() => {
    editor.value = 'replaced';
  });
  assert.equal(editor.value, 'replaced');
  assert.equal(editor.selectionStart, 'replaced'.length);
});

test('typing reports the string to onChange and keeps the DOM plain', () => {
  const { editor, state } = renderEditor();
  typeText(editor, 'hi');
  assert.equal(state.changes.at(-1), 'hi');
  assert.equal(editor.innerHTML, 'hi<br>');
});

test('markup the browser leaves behind is normalized away, the caret kept', () => {
  const { editor, state } = renderEditor();
  act(() => {
    editor.focus();
    editor.innerHTML = '<b>bold</b><div>next <img src="https://example.com/x.png"></div>';
    const lastText = editor.querySelector('div')!.firstChild!;
    document.getSelection()!.collapse(lastText, 5);
    fireEvent.input(editor);
  });
  assert.equal(state.changes.at(-1), 'bold\nnext ');
  assert.equal(editor.innerHTML, 'bold\nnext <br>');
  assert.equal(editor.querySelector('img'), null);
  assert.equal(editor.selectionStart, 'bold\nnext '.length);
});

test('Enter inserts a newline at the caret instead of a block', () => {
  const { editor, state } = renderEditor('ab');
  act(() => {
    editor.focus();
    editor.setSelectionRange(1, 1);
  });
  const event = beforeInput(editor, 'insertParagraph');
  assert.equal(event.defaultPrevented, true);
  assert.equal(state.changes.at(-1), 'a\nb');
  assert.equal(editor.value, 'a\nb');
  assert.equal(editor.selectionStart, 2);
});

test('formatting commands are refused', () => {
  const { editor } = renderEditor('ab');
  assert.equal(beforeInput(editor, 'formatBold').defaultPrevented, true);
});

test('a paste inserts plain text at the caret, never the HTML', () => {
  const { editor, state } = renderEditor('ac');
  act(() => {
    editor.focus();
    editor.setSelectionRange(1, 1);
  });
  fireEvent.paste(editor, { clipboardData: transfer({ text: 'B\r\nB', html: '<b>B</b><br>B' }) });
  assert.equal(state.changes.at(-1), 'aB\nBc');
  assert.equal(editor.innerHTML, 'aB\nBc<br>');
  assert.equal(editor.selectionStart, 4);
});

test('a pasted image becomes an attachment and never enters the editor', () => {
  const { editor, state } = renderEditor('x');
  const png = new File(['p'], 'shot.png', { type: 'image/png' });
  act(() => editor.focus());
  fireEvent.paste(editor, { clipboardData: transfer({ files: [png] }) });
  assert.deepEqual(state.pastedImages, [png]);
  assert.equal(editor.value, 'x');
  assert.equal(editor.querySelector('img'), null);
});

test('a keyboard image delivered through beforeinput becomes an attachment', () => {
  const { editor, state } = renderEditor('x');
  const gif = new File(['g'], 'sticker.gif', { type: 'image/gif' });
  act(() => editor.focus());
  const paste = beforeInput(editor, 'insertFromPaste', transfer({ files: [gif] }));
  assert.equal(paste.defaultPrevented, true);
  const replacement = beforeInput(editor, 'insertReplacementText', transfer({ files: [gif] }));
  assert.equal(replacement.defaultPrevented, true);
  assert.deepEqual(state.pastedImages, [gif, gif]);
  assert.equal(editor.value, 'x');
});

test('a beforeinput paste of HTML goes in as plain text', () => {
  const { editor, state } = renderEditor('');
  act(() => editor.focus());
  const event = beforeInput(editor, 'insertFromPaste', transfer({ text: 'plain', html: '<i>plain</i>' }));
  assert.equal(event.defaultPrevented, true);
  assert.equal(state.changes.at(-1), 'plain');
  assert.equal(editor.innerHTML, 'plain<br>');
});

test('typing / opens the slash command menu', async () => {
  const { editor, state } = renderEditor();
  await waitFor(() => assert.equal(listCommands.mock.calls.length > 0, true));
  typeText(editor, '/fire');
  await waitFor(() => assert.equal(state.showCommandMenu, true));
});

test('typing @ opens the file mention dropdown', async () => {
  const { editor, state } = renderEditor();
  typeText(editor, 'see @no');
  await waitFor(() => {
    assert.equal(state.showFileDropdown, true);
    assert.deepEqual(state.filteredFiles, ['notes.md']);
  });
});

test('ArrowUp in an empty box recalls history with the caret at its end', () => {
  const { editor, state } = renderEditor();
  act(() => state.recordSent('previous message'));
  act(() => editor.focus());
  fireEvent.keyDown(editor, { key: 'ArrowUp' });
  assert.equal(editor.value, 'previous message');
  assert.equal(editor.selectionStart, 'previous message'.length);
});
