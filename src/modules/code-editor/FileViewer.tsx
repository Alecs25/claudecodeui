import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  ArrowLeft,
  ArrowUp,
  Check,
  Code,
  Download,
  ExternalLink,
  Eye,
  FileText,
  MessageSquare,
  Monitor,
  PanelRight,
  Smartphone,
  Tablet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/context/ThemeContext';
import { formatFileSize } from '@/shared/utils';
import CodeEditorSurface from '@/modules/code-editor/CodeEditorSurface';
import FileViewerPageStage from '@/modules/code-editor/FileViewerPageStage';
import { useCodeEditorSettings } from '@/modules/code-editor/hooks/useCodeEditorSettings';
import { useFileViewerContent } from '@/modules/code-editor/hooks/useFileViewerContent';
import MarkdownPreview from '@/modules/code-editor/markdown/MarkdownPreview';
import { getLanguageExtensions } from '@/modules/code-editor/utils/editorExtensions';
import { getEditorStyles } from '@/modules/code-editor/utils/editorStyles';
import {
  PAGE_WIDTH_PRESETS,
  buildFileQuestionPrompt,
  fetchFileViewerTarget,
  fileViewerTargetName,
  getFileViewerKind,
  hasSourceView,
  openHtmlInNewTab,
  readPageWidthPreset,
  storePageWidthPreset,
  type FileViewerTarget,
  type PageWidthPreset,
} from '@/modules/code-editor/utils/fileViewer';
import { getPreviewMimeType } from '@/modules/code-editor/utils/previewableFile';
import { isTouchDevice } from '@/modules/code-editor/utils/sentFiles';

type FileViewerProps = {
  target: FileViewerTarget;
  /** Title of the session the file belongs to, shown under the file name. */
  sessionLabel?: string | null;
  isMobile: boolean;
  /** Absent when there is no session to ask: the field is then not shown. */
  onAsk?: (prompt: string) => void;
  /** Moves the file to the side panel ("side by side"); absent on phones. */
  onDock?: () => void;
  onClose: () => void;
};

const PRESET_ICONS: Record<PageWidthPreset, LucideIcon> = {
  phone: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
};
const PRESET_ORDER: PageWidthPreset[] = ['phone', 'tablet', 'desktop'];
const PRESET_DEFAULT_LABELS: Record<PageWidthPreset, string> = { phone: 'Phone', tablet: 'Tablet', desktop: 'Desktop' };
const SENT_CONFIRMATION_MS = 2000;
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), textarea, iframe, [tabindex]:not([tabindex="-1"])';

const ICON_BUTTON_CLASS = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const SEGMENT_CLASS = 'flex h-7 items-center gap-1 rounded px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const segmentStateClass = (active: boolean) => (active
  ? 'bg-background text-foreground shadow-sm'
  : 'text-muted-foreground hover:text-foreground');

// Read-only like the side panel shows sent files: the viewer never writes back.
const READ_ONLY_EXTENSIONS = [EditorState.readOnly.of(true), EditorView.editable.of(false), EditorView.lineWrapping];

/**
 * Rendered by the project-workspace module over the workspace: the central
 * viewer for sent files and HTML files linked in chat, with a rendered/source
 * toggle, page widths for HTML and a field to ask Claude about the file.
 */
export default function FileViewer({ target, sessionLabel, isMobile, onAsk, onDock, onClose }: FileViewerProps) {
  const { t } = useTranslation('codeEditor');
  const { isDarkMode } = useTheme();
  const { fontSize, showLineNumbers } = useCodeEditorSettings();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const name = fileViewerTargetName(target);
  const kind = getFileViewerKind(name);
  const content = useFileViewerContent(target, kind, name);
  // Rendered page or its source; only HTML and Markdown have both.
  const [showSource, setShowSource] = useState(false);
  // Device width the HTML page is laid out at, remembered across files and reloads.
  const [pagePreset, setPagePreset] = useState<PageWidthPreset>(() => readPageWidthPreset(window.innerWidth));
  // The "ask Claude" draft, kept while the viewer stays open after sending.
  const [question, setQuestion] = useState('');
  // Brief "Sent" confirmation after a question went to the session.
  const [questionSent, setQuestionSent] = useState(false);

  const sizeLabel = target.source === 'sent' ? formatFileSize(target.file.size) : null;
  const subtitle = [sessionLabel, sizeLabel].filter(Boolean).join(' · ');
  const text = content.status === 'ready' ? content.text : null;
  const url = content.status === 'ready' ? content.url : null;
  const isSvg = getPreviewMimeType(name) === 'image/svg+xml';
  // Mobile browsers have no inline PDF viewer: the system one in a new tab works.
  const pdfNeedsNewTab = kind === 'pdf' && isTouchDevice();
  const showsSource = (hasSourceView(kind) && showSource) || kind === 'text';

  // Escape closes from anywhere in the viewer, before the side panel's own
  // Escape handler or the composer's can act on it.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  // Focus moves into the viewer and goes back where it was on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  useEffect(() => {
    if (!questionSent) return undefined;
    const timer = window.setTimeout(() => setQuestionSent(false), SENT_CONFIRMATION_MS);
    return () => window.clearTimeout(timer);
  }, [questionSent]);

  // Tab cycles inside the viewer: the chat underneath stays out of reach.
  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const selectPreset = (preset: PageWidthPreset) => {
    setPagePreset(preset);
    storePageWidthPreset(preset);
  };

  const handleDownload = useCallback(async () => {
    // Files without a preview were never loaded: fetch them only when asked for.
    const blob = text !== null
      ? new Blob([text], { type: 'text/plain' })
      : url === null ? await fetchFileViewerTarget(target).then((response) => (response.ok ? response.blob() : null)) : null;
    const blobUrl = blob ? URL.createObjectURL(blob) : url;
    if (!blobUrl) return;
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    if (blob) URL.revokeObjectURL(blobUrl);
  }, [name, target, text, url]);

  const handleAsk = (event: FormEvent) => {
    event.preventDefault();
    const prompt = buildFileQuestionPrompt(name, question);
    if (!prompt || !onAsk) return;
    onAsk(prompt);
    setQuestion('');
    setQuestionSent(true);
  };

  const codeExtensions = useMemo(() => [...getLanguageExtensions(name), ...READ_ONLY_EXTENSIONS], [name]);

  const renderBody = () => {
    if (content.status === 'loading') {
      return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">{t('fileViewer.loading', 'Loading…')}</div>;
    }
    if (content.status === 'error' || kind === 'binary' || (kind === 'pdf' && pdfNeedsNewTab)) {
      const message = content.status === 'error'
        ? t('fileViewer.error', 'Unable to display this file.')
        : kind === 'pdf' ? t('fileViewer.pdfInNewTab', 'Open the PDF in a new tab to read it.') : t('fileViewer.noPreview', 'No preview for this file type.');
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
          <FileText className="h-10 w-10" aria-hidden="true" />
          <p>{message}</p>
          {kind === 'pdf' && url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-accent">
              {t('fileViewer.openInNewTab', 'Open in new tab')}
            </a>
          )}
        </div>
      );
    }
    if (showsSource) {
      return (
        <div className="min-h-0 flex-1 overflow-hidden pb-16">
          <style>{getEditorStyles(isDarkMode)}</style>
          <CodeEditorSurface
            content={text ?? ''}
            onChange={() => undefined}
            markdownPreview={false}
            isMarkdownFile={false}
            fileName={name}
            isDarkMode={isDarkMode}
            fontSize={fontSize}
            showLineNumbers={showLineNumbers}
            extensions={codeExtensions}
          />
        </div>
      );
    }
    switch (kind) {
      case 'html':
        return <FileViewerPageStage content={text ?? ''} title={name} pageWidth={isMobile ? null : PAGE_WIDTH_PRESETS[pagePreset]} />;
      case 'markdown':
        return (
          <div className="min-h-0 flex-1 overflow-y-auto bg-white pb-16 dark:bg-gray-900">
            <div className="prose prose-sm mx-auto max-w-4xl px-6 py-6 dark:prose-invert">
              <MarkdownPreview content={text ?? ''} />
            </div>
          </div>
        );
      case 'image':
        return (
          <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/30 p-4 pb-16">
            <img src={url ?? undefined} alt={name} className="max-h-full max-w-full object-contain" />
          </div>
        );
      case 'pdf':
        // Not sandboxed: the browser PDF viewer refuses sandboxed frames; the
        // bytes were checked and the type pinned by useFileViewerContent.
        return (
          <div className="flex min-h-0 flex-1 pb-16">
            <iframe src={url ?? undefined} title={name} className="h-full w-full border-0 bg-white" />
          </div>
        );
      case 'video':
        return (
          <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-4 pb-16">
            <video src={url ?? undefined} controls className="max-h-full max-w-full" />
          </div>
        );
      case 'audio':
        return (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6 pb-16">
            <audio src={url ?? undefined} controls className="w-full max-w-xl" />
          </div>
        );
      default:
        return null;
    }
  };

  const canOpenInNewTab = content.status === 'ready' && (
    (kind === 'html' && text !== null) || ((kind === 'pdf' || kind === 'image' || kind === 'video') && url !== null && !isSvg)
  );
  const newTabLabel = t('fileViewer.openInNewTab', 'Open in new tab');

  return (
    <div className="fixed inset-0 z-[9000] flex items-stretch justify-center md:p-6" data-escape-layer>
      <div className="absolute inset-0 hidden bg-black/50 md:block" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={name}
        tabIndex={-1}
        onKeyDown={trapFocus}
        className="relative flex h-full w-full flex-col overflow-hidden bg-background shadow-2xl focus:outline-none md:rounded-2xl"
      >
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5 sm:gap-2 sm:px-3">
          {isMobile ? (
            <button type="button" onClick={onClose} className={ICON_BUTTON_CLASS} aria-label={t('fileViewer.back', 'Back')} title={t('fileViewer.back', 'Back')}>
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden="true">
              <FileText className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">{name}</div>
            {subtitle && <div className="truncate text-xs text-muted-foreground">{isMobile ? sizeLabel : subtitle}</div>}
          </div>

          {hasSourceView(kind) && (
            <div role="radiogroup" aria-label={t('fileViewer.view', 'View')} className="flex shrink-0 items-center rounded-md bg-muted p-0.5">
              <button type="button" role="radio" aria-checked={!showSource} onClick={() => setShowSource(false)} className={`${SEGMENT_CLASS} ${segmentStateClass(!showSource)}`} title={t('fileViewer.preview', 'Preview')}>
                <Eye className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{t('fileViewer.preview', 'Preview')}</span>
              </button>
              <button type="button" role="radio" aria-checked={showSource} onClick={() => setShowSource(true)} className={`${SEGMENT_CLASS} ${segmentStateClass(showSource)}`} title={t('fileViewer.code', 'Code')}>
                <Code className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{t('fileViewer.code', 'Code')}</span>
              </button>
            </div>
          )}

          {kind === 'html' && !isMobile && !showSource && (
            <div role="radiogroup" aria-label={t('fileViewer.pageWidth', 'Page width')} className="flex shrink-0 items-center rounded-md bg-muted p-0.5">
              {PRESET_ORDER.map((preset) => {
                const Icon = PRESET_ICONS[preset];
                const label = `${t(`fileViewer.widths.${preset}`, { defaultValue: PRESET_DEFAULT_LABELS[preset] })} · ${PAGE_WIDTH_PRESETS[preset]}`;
                return (
                  <button
                    key={preset}
                    type="button"
                    role="radio"
                    aria-checked={pagePreset === preset}
                    aria-label={label}
                    title={label}
                    onClick={() => selectPreset(preset)}
                    className={`${SEGMENT_CLASS} ${segmentStateClass(pagePreset === preset)}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex shrink-0 items-center">
            {onDock && !isMobile && (
              <button type="button" onClick={onDock} className={ICON_BUTTON_CLASS} aria-label={t('fileViewer.dock', 'Side by side')} title={t('fileViewer.dock', 'Side by side')}>
                <PanelRight className="h-4 w-4" />
              </button>
            )}
            {canOpenInNewTab && (kind === 'html' ? (
              <button type="button" onClick={() => openHtmlInNewTab(text ?? '', name)} className={ICON_BUTTON_CLASS} aria-label={newTabLabel} title={newTabLabel}>
                <ExternalLink className="h-4 w-4" />
              </button>
            ) : (
              <a href={url ?? undefined} target="_blank" rel="noopener noreferrer" className={ICON_BUTTON_CLASS} aria-label={newTabLabel} title={newTabLabel}>
                <ExternalLink className="h-4 w-4" />
              </a>
            ))}
            {content.status === 'ready' && (
              <button type="button" onClick={() => void handleDownload()} className={ICON_BUTTON_CLASS} aria-label={t('actions.download')} title={t('actions.download')}>
                <Download className="h-4 w-4" />
              </button>
            )}
            {!isMobile && (
              <button type="button" onClick={onClose} className={ICON_BUTTON_CLASS} aria-label={t('fileViewer.close', 'Close')} title={t('fileViewer.close', 'Close')}>
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          {renderBody()}

          {onAsk && (
            <form
              onSubmit={handleAsk}
              className="absolute bottom-3 left-2.5 right-2.5 mx-auto flex max-w-[520px] items-center gap-1.5 rounded-full border border-border bg-background py-1 pl-3 pr-1 shadow-lg"
            >
              <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                type="text"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={isMobile ? t('fileViewer.askShort', 'Ask Claude…') : t('fileViewer.ask', 'Ask Claude about this file…')}
                aria-label={t('fileViewer.ask', 'Ask Claude about this file…')}
                className="min-w-0 flex-1 bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              {questionSent && (
                <span role="status" className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('fileViewer.sent', 'Sent')}
                </span>
              )}
              <button
                type="submit"
                disabled={!question.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
                aria-label={t('fileViewer.send', 'Send')}
                title={t('fileViewer.send', 'Send')}
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
