import * as React from 'react';

import { cn } from '@/shared/utils';
import {
  imageSourceToFile,
  isCanonicalEditorDom,
  readEditorSelection,
  readEditorText,
  readTransferImages,
  readTransferText,
  renderEditorText,
  repairEditorDom,
  scrollSelectionIntoView,
  takeEditorImages,
  writeEditorSelection,
} from '@/modules/chat/utils/plainTextEditor';
import type { EditorSelection } from '@/modules/chat/utils/plainTextEditor';

/**
 * The slice of HTMLTextAreaElement the composer hooks use. The editor element
 * implements it, so `textareaRef.current` keeps working unchanged.
 */
export type TextareaLikeElement = HTMLDivElement & {
  value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  setSelectionRange: (start: number, end?: number) => void;
};

type TextareaEventProps = Pick<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  'onChange' | 'onClick' | 'onKeyDown' | 'onPaste' | 'onScroll' | 'onFocus' | 'onBlur' | 'onInput'
>;

export type PromptInputEditableProps = TextareaEventProps & {
  value: string;
  placeholder?: string;
  className?: string;
  dir?: string;
  enterKeyHint?: React.HTMLAttributes<HTMLDivElement>['enterKeyHint'];
  'aria-label'?: string;
};

/** Edits that would add formatting: a plain-text box refuses them all. */
const FORMAT_INPUT_TYPE = /^format/;
const PASTE_INPUT_TYPES = new Set(['insertFromPaste', 'insertFromPasteAsQuotation', 'insertFromDrop', 'insertFromYank']);
const NEWLINE_INPUT_TYPES = new Set(['insertParagraph', 'insertLineBreak']);

const clamp = (offset: number, length: number) => Math.max(0, Math.min(Number.isFinite(offset) ? offset : length, length));

/**
 * The event the composer's handlers receive. They read `target`/`currentTarget`
 * (the editor, with a textarea's `value` and selection) and may call
 * `preventDefault`; nothing else.
 */
const toTextareaEvent = <T,>(element: TextareaLikeElement, nativeEvent: Event): T =>
  ({
    target: element,
    currentTarget: element,
    nativeEvent,
    type: nativeEvent.type,
    preventDefault: () => nativeEvent.preventDefault(),
    isDefaultPrevented: () => nativeEvent.defaultPrevented,
    stopPropagation: () => nativeEvent.stopPropagation(),
    isPropagationStopped: () => false,
    persist: () => {},
  }) as unknown as T;

/** A paste event carrying only `files`, for the composer's image paste handler. */
const toImagePasteEvent = (files: File[]) =>
  ({
    clipboardData: {
      files,
      items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
      getData: () => '',
    },
    preventDefault: () => {},
  }) as unknown as React.ClipboardEvent<HTMLTextAreaElement>;

/**
 * Plain-text contenteditable used as the composer on touch devices.
 *
 * Android keyboards (Samsung Keyboard, Gboard) offer clipboard images and
 * stickers only to rich editors: Chrome tells them a <textarea> takes text
 * only. This editor is `contenteditable="true"` (`plaintext-only` would get the
 * same refusal), turns every image into an attachment and keeps its DOM as
 * plain text, so to the rest of the composer it is still a textarea.
 */
export const PromptInputEditable = React.forwardRef<TextareaLikeElement, PromptInputEditableProps>(
  (
    {
      value,
      placeholder,
      className,
      dir,
      enterKeyHint,
      'aria-label': ariaLabel,
      onChange,
      onClick,
      onKeyDown,
      onPaste,
      onScroll,
      onFocus,
      onBlur,
      onInput,
    },
    forwardedRef,
  ) => {
    const elementRef = React.useRef<TextareaLikeElement | null>(null);
    const composingRef = React.useRef(false);
    const lastSelectionRef = React.useRef<EditorSelection | null>(null);
    // Handlers change on every composer render; the native listeners read the latest ones.
    const handlersRef = React.useRef({ onChange, onInput, onPaste });
    React.useLayoutEffect(() => {
      handlersRef.current = { onChange, onInput, onPaste };
    });

    const isFocused = () => {
      const element = elementRef.current;
      return Boolean(element && element.ownerDocument.activeElement === element);
    };

    const deliverImages = React.useCallback((files: File[]) => {
      if (files.length > 0) {
        handlersRef.current.onPaste?.(toImagePasteEvent(files));
      }
    }, []);

    /** Tells the composer the text changed, as a textarea's input event would. */
    const notifyChange = React.useCallback((nativeEvent: Event) => {
      const element = elementRef.current;
      if (!element) {
        return;
      }
      handlersRef.current.onChange?.(toTextareaEvent(element, nativeEvent));
      handlersRef.current.onInput?.(toTextareaEvent(element, nativeEvent));
    }, []);

    /** Brings the DOM back to plain text, keeping the caret where it was. */
    const normalize = React.useCallback(() => {
      const element = elementRef.current;
      if (!element) {
        return;
      }
      const imageSources = takeEditorImages(element);
      if (imageSources.length > 0) {
        void Promise.all(imageSources.map((source) => imageSourceToFile(source))).then((files) =>
          deliverImages(files.filter((file): file is File => file !== null)),
        );
      }
      if (composingRef.current) {
        // Rewriting the DOM mid-composition would cancel the word being typed.
        return;
      }
      const text = readEditorText(element);
      if (repairEditorDom(element, text)) {
        return;
      }
      const selection = isFocused() ? readEditorSelection(element) : null;
      renderEditorText(element, text);
      if (selection) {
        writeEditorSelection(element, selection.start, selection.end);
      }
    }, [deliverImages]);

    /** Replaces the selection with plain text, the way a textarea paste would. */
    const insertPlainText = React.useCallback((text: string, nativeEvent: Event) => {
      const element = elementRef.current;
      if (!element) {
        return;
      }
      const current = readEditorText(element);
      const selection = readEditorSelection(element) ?? lastSelectionRef.current ?? { start: current.length, end: current.length };
      const start = clamp(selection.start, current.length);
      const end = clamp(selection.end, current.length);
      const caret = start + text.length;
      renderEditorText(element, `${current.slice(0, start)}${text}${current.slice(end)}`);
      writeEditorSelection(element, caret, caret);
      lastSelectionRef.current = { start: caret, end: caret };
      notifyChange(nativeEvent);
      scrollSelectionIntoView(element);
    }, [notifyChange]);

    // The textarea surface the composer hooks read and write.
    const attachTextareaApi = React.useCallback((element: TextareaLikeElement) => {
      const readSelection = (): EditorSelection => {
        const length = readEditorText(element).length;
        const live = readEditorSelection(element);
        if (live) {
          lastSelectionRef.current = live;
          return live;
        }
        const stored = lastSelectionRef.current;
        return stored
          ? { start: clamp(stored.start, length), end: clamp(stored.end, length) }
          : { start: length, end: length };
      };
      const applySelection = (start: number, end: number) => {
        const length = readEditorText(element).length;
        const from = clamp(start, length);
        const to = clamp(end, length);
        lastSelectionRef.current = { start: Math.min(from, to), end: Math.max(from, to) };
        if (!isFocused()) {
          return;
        }
        if (!composingRef.current) {
          const text = readEditorText(element);
          if (!isCanonicalEditorDom(element, text)) {
            renderEditorText(element, text);
          }
        }
        writeEditorSelection(element, lastSelectionRef.current.start, lastSelectionRef.current.end);
        scrollSelectionIntoView(element);
      };
      const nativeFocus = HTMLElement.prototype.focus;

      Object.defineProperties(element, {
        value: {
          configurable: true,
          get: () => readEditorText(element),
          set: (next: unknown) => {
            const text = String(next ?? '');
            renderEditorText(element, text);
            lastSelectionRef.current = { start: text.length, end: text.length };
            if (isFocused()) {
              writeEditorSelection(element, text.length, text.length);
            }
          },
        },
        selectionStart: { configurable: true, get: () => readSelection().start },
        selectionEnd: { configurable: true, get: () => readSelection().end },
        setSelectionRange: {
          configurable: true,
          value: (start: number, end: number = start) => applySelection(start, end),
        },
        // Like a textarea, a programmatic focus brings back the last caret
        // instead of jumping to the start of the text.
        focus: {
          configurable: true,
          value: (options?: FocusOptions) => {
            nativeFocus.call(element, options);
            if (!readEditorSelection(element)) {
              const length = readEditorText(element).length;
              const stored = lastSelectionRef.current ?? { start: length, end: length };
              applySelection(stored.start, stored.end);
            }
          },
        },
      });
    }, []);

    const setRefs = React.useCallback((node: HTMLDivElement | null) => {
      const element = node as TextareaLikeElement | null;
      if (element) {
        attachTextareaApi(element);
      }
      elementRef.current = element;
      if (typeof forwardedRef === 'function') {
        forwardedRef(element);
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<TextareaLikeElement | null>).current = element;
      }
    }, [attachTextareaApi, forwardedRef]);

    // Controlled value: the DOM follows `value` unless it already shows it.
    React.useLayoutEffect(() => {
      const element = elementRef.current;
      if (!element) {
        return;
      }
      const current = readEditorText(element);
      if (current === value && (composingRef.current || isCanonicalEditorDom(element, value))) {
        return;
      }
      const focused = isFocused();
      const selection = current === value && focused ? readEditorSelection(element) : null;
      renderEditorText(element, value);
      if (selection) {
        writeEditorSelection(element, selection.start, selection.end);
        return;
      }
      // A textarea whose value is replaced puts the caret at the end.
      lastSelectionRef.current = { start: value.length, end: value.length };
      if (focused) {
        writeEditorSelection(element, value.length, value.length);
      }
    }, [value]);

    // beforeinput is not a React event: React's onBeforeInput is a different, text-only event.
    React.useEffect(() => {
      const element = elementRef.current;
      if (!element) {
        return undefined;
      }
      const handleBeforeInput = (event: InputEvent) => {
        const { inputType } = event;
        if (FORMAT_INPUT_TYPE.test(inputType)) {
          event.preventDefault();
          return;
        }
        if (NEWLINE_INPUT_TYPES.has(inputType)) {
          event.preventDefault();
          insertPlainText('\n', event);
          return;
        }
        if (!PASTE_INPUT_TYPES.has(inputType) && inputType !== 'insertReplacementText') {
          return;
        }
        const transfer = event.dataTransfer;
        const images = readTransferImages(transfer);
        if (images.length > 0) {
          // A keyboard's clipboard image or sticker: an attachment, never an <img>.
          event.preventDefault();
          deliverImages(images);
          const text = inputType === 'insertReplacementText' ? '' : readTransferText(transfer);
          if (text) {
            insertPlainText(text, event);
          }
          return;
        }
        if (PASTE_INPUT_TYPES.has(inputType) && transfer) {
          event.preventDefault();
          const text = readTransferText(transfer);
          if (text) {
            insertPlainText(text, event);
          }
        }
      };
      const handleSelectionChange = () => {
        const selection = readEditorSelection(element);
        if (selection) {
          lastSelectionRef.current = selection;
        }
      };
      element.addEventListener('beforeinput', handleBeforeInput);
      element.ownerDocument.addEventListener('selectionchange', handleSelectionChange);
      return () => {
        element.removeEventListener('beforeinput', handleBeforeInput);
        element.ownerDocument.removeEventListener('selectionchange', handleSelectionChange);
      };
    }, [deliverImages, insertPlainText]);

    const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
      // The composer's handler takes the images; the text goes in here, stripped of its HTML.
      onPaste?.(event as unknown as React.ClipboardEvent<HTMLTextAreaElement>);
      event.preventDefault();
      const text = readTransferText(event.clipboardData);
      if (text) {
        insertPlainText(text, event.nativeEvent);
      }
    };

    const handleInput = (event: React.FormEvent<HTMLDivElement>) => {
      normalize();
      notifyChange(event.nativeEvent);
    };

    const handleCompositionEnd = () => {
      composingRef.current = false;
      normalize();
    };

    const asTextarea = <T,>(handler: ((event: T) => void) | undefined) =>
      handler as unknown as ((event: React.SyntheticEvent<HTMLDivElement>) => void) | undefined;

    return (
      <>
        {value === '' && placeholder && (
          <div
            aria-hidden="true"
            dir={dir}
            className={cn(
              'pointer-events-none absolute inset-x-0 top-0 whitespace-pre-wrap break-words px-4 py-2 text-sm leading-6 text-muted-foreground/50',
              className,
            )}
          >
            {placeholder}
          </div>
        )}
        <div
          ref={setRefs}
          data-slot="prompt-input-textarea"
          contentEditable="true"
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel ?? placeholder}
          aria-placeholder={placeholder}
          tabIndex={0}
          dir={dir}
          enterKeyHint={enterKeyHint}
          inputMode="text"
          autoCapitalize="sentences"
          autoCorrect="on"
          spellCheck
          className={cn(
            'chat-input-placeholder block max-h-[40vh] min-h-6 w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-4 py-2 text-sm leading-6 text-foreground focus:outline-none sm:max-h-[300px]',
            className,
          )}
          onInput={handleInput}
          onPaste={handlePaste}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={handleCompositionEnd}
          onKeyDown={asTextarea(onKeyDown)}
          onClick={asTextarea(onClick)}
          onScroll={asTextarea(onScroll)}
          onFocus={asTextarea(onFocus)}
          onBlur={asTextarea(onBlur)}
        />
      </>
    );
  },
);
PromptInputEditable.displayName = 'PromptInputEditable';
