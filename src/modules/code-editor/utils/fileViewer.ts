import { api } from '@/shared/api';
import { HTML_PREVIEW_SANDBOX } from '@/shared/constants';
import type { SentFileSummary } from '@/shared/types';
import { isBinaryFile } from '@/modules/code-editor/utils/binaryFile';
import { getPreviewKind } from '@/modules/code-editor/utils/previewableFile';

/**
 * The central file viewer: a large overlay over the workspace for files an
 * agent sent (send_user_file) and for HTML files linked in chat. Kept apart
 * from the side panel (useEditorSidebar), which the viewer's "side by side"
 * action hands the file to.
 */

/** Window event that asks the workspace to show a file in the central viewer. Detail: FileViewerTarget. */
export const OPEN_FILE_VIEWER_EVENT = 'cloudcli:open-file-viewer';

/** What the viewer shows: a sent-file copy, or a file of the current project. */
export type FileViewerTarget =
  | { source: 'sent'; file: SentFileSummary }
  | { source: 'project'; name: string; path: string; projectId: string };

/** How the viewer renders a file, derived from its name. */
export type FileViewerKind = 'html' | 'markdown' | 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'binary';

/** HTML page widths in CSS pixels, as the devices they stand for. */
export const PAGE_WIDTH_PRESETS = {
  phone: 390,
  tablet: 820,
  desktop: 1280,
} as const;

export type PageWidthPreset = keyof typeof PAGE_WIDTH_PRESETS;

// Below this viewport a desktop-wide page would be scaled to unreadable text.
const DESKTOP_PRESET_MIN_VIEWPORT = 1024;
const PAGE_WIDTH_STORAGE_KEY = 'cloudcli:file-viewer:page-width';
// The card announced over the websocket mounts a moment later, once the tool
// result reaches the transcript; past this a mount is a history reload.
const FRESH_SENT_FILE_TTL_MS = 30_000;
/** Auto-open only where the viewer leaves the page readable (a Fold opened is ~900px). */
export const AUTO_OPEN_MIN_VIEWPORT_WIDTH = 1024;

const extensionOf = (name: string): string => name.split('.').pop()?.toLowerCase() ?? '';

export const fileViewerTargetName = (target: FileViewerTarget): string =>
  target.source === 'sent' ? target.file.name : target.name;

export const getFileViewerKind = (name: string): FileViewerKind => {
  const extension = extensionOf(name);
  if (extension === 'html' || extension === 'htm') return 'html';
  if (extension === 'md' || extension === 'markdown') return 'markdown';
  const previewKind = getPreviewKind(name);
  if (previewKind) return previewKind;
  return isBinaryFile(name) ? 'binary' : 'text';
};

/** Kinds that have a rendered view besides their source. */
export const hasSourceView = (kind: FileViewerKind): boolean => kind === 'html' || kind === 'markdown';

// Big pages would cost a fetch and a full render per chat card just for a strip.
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;

/** Whether the chat card shows a page or picture strip for this sent file. */
export const hasSentFileThumbnail = (file: Pick<SentFileSummary, 'name' | 'size'>): boolean => {
  const kind = getFileViewerKind(file.name);
  return (kind === 'html' || kind === 'image') && file.size <= MAX_THUMBNAIL_BYTES;
};

export const isHtmlFileName = (name: string): boolean => getFileViewerKind(name) === 'html';

/** Reads the raw bytes of what the viewer shows; both endpoints need the auth header. */
export const fetchFileViewerTarget = (target: FileViewerTarget, signal?: AbortSignal): Promise<Response> => (
  target.source === 'sent'
    ? api.readSentFileContent(target.file.id, { signal })
    : api.readFileBlob(target.projectId, target.path, { signal })
);

export const requestFileViewerOpen = (target: FileViewerTarget): void => {
  window.dispatchEvent(new CustomEvent<FileViewerTarget>(OPEN_FILE_VIEWER_EVENT, { detail: target }));
};

export const readFileViewerTarget = (event: Event): FileViewerTarget | null => {
  const detail = (event as CustomEvent<FileViewerTarget | undefined>).detail;
  if (detail?.source === 'sent' && typeof detail.file?.id === 'string') return detail;
  if (detail?.source === 'project' && typeof detail.path === 'string' && typeof detail.projectId === 'string') return detail;
  return null;
};

export const defaultPageWidthPreset = (viewportWidth: number): PageWidthPreset =>
  viewportWidth >= DESKTOP_PRESET_MIN_VIEWPORT ? 'desktop' : 'tablet';

const isPageWidthPreset = (value: unknown): value is PageWidthPreset =>
  typeof value === 'string' && value in PAGE_WIDTH_PRESETS;

export const readPageWidthPreset = (viewportWidth: number): PageWidthPreset => {
  try {
    const stored = window.localStorage.getItem(PAGE_WIDTH_STORAGE_KEY);
    if (isPageWidthPreset(stored)) return stored;
  } catch {
    // Storage blocked (private mode, sandbox): the default still works.
  }
  return defaultPageWidthPreset(viewportWidth);
};

export const storePageWidthPreset = (preset: PageWidthPreset): void => {
  try {
    window.localStorage.setItem(PAGE_WIDTH_STORAGE_KEY, preset);
  } catch {
    // Not remembered across reloads; the choice still applies now.
  }
};

export type PageFit = {
  /** Factor the page is drawn at; never above 1, a narrow page is not enlarged. */
  scale: number;
  /** Unscaled iframe height that, once scaled, fills the stage height. */
  frameHeight: number;
  /** Size of the scaled page on the stage. */
  boxWidth: number;
  boxHeight: number;
};

/** Fits a page of `pageWidth` CSS px into the stage's free area, keeping the page's own width. */
export const computePageFit = (pageWidth: number, availableWidth: number, availableHeight: number): PageFit => {
  const width = Math.max(availableWidth, 1);
  const height = Math.max(availableHeight, 1);
  const scale = Math.min(1, width / pageWidth);
  return {
    scale,
    frameHeight: height / scale,
    boxWidth: pageWidth * scale,
    boxHeight: height,
  };
};

/** The message sent from the viewer's "ask Claude" field: the file reference, then the question. */
export const buildFileQuestionPrompt = (fileName: string, question: string): string => {
  const text = question.trim();
  return text ? `[file: ${fileName}]\n${text}` : '';
};

/** Opens HTML in a new tab inside the same sandboxed iframe as the in-app preview. */
export const openHtmlInNewTab = (content: string, title: string): void => {
  const previewWindow = window.open('', '_blank');
  if (!previewWindow) return;

  previewWindow.opener = null;
  previewWindow.document.title = title;
  previewWindow.document.body.style.margin = '0';

  const iframe = previewWindow.document.createElement('iframe');
  iframe.title = title;
  iframe.setAttribute('sandbox', HTML_PREVIEW_SANDBOX);
  iframe.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;background:white';
  iframe.srcdoc = content;
  previewWindow.document.body.appendChild(iframe);
};

//----------------- AUTO-OPEN ------------

// The websocket announces a sent file without its session; the chat card only
// mounts in the transcript on screen. A file is marked fresh on arrival and
// the card that mounts for it soon after opens it, so the viewer opens only
// for the session being looked at.
const freshSentFiles = new Map<string, number>();

type AutoOpenConditions = {
  enabled: boolean;
  viewportWidth: number;
  pageVisible: boolean;
};

export const shouldAutoOpenSentFiles = ({ enabled, viewportWidth, pageVisible }: AutoOpenConditions): boolean =>
  enabled && pageVisible && viewportWidth >= AUTO_OPEN_MIN_VIEWPORT_WIDTH;

export const markSentFileFresh = (sentFileId: string, now = Date.now()): void => {
  freshSentFiles.set(sentFileId, now);
};

/** True once per fresh file, for the card that should open it. */
export const consumeFreshSentFile = (sentFileId: string, now = Date.now()): boolean => {
  const markedAt = freshSentFiles.get(sentFileId);
  if (markedAt === undefined) return false;
  freshSentFiles.delete(sentFileId);
  return now - markedAt <= FRESH_SENT_FILE_TTL_MS;
};
