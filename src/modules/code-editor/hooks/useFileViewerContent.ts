import { useEffect, useState } from 'react';

import { fetchFileViewerTarget, type FileViewerKind, type FileViewerTarget } from '@/modules/code-editor/utils/fileViewer';
import { getPreviewMimeType, looksLikePdf } from '@/modules/code-editor/utils/previewableFile';

type FileViewerContent =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; text: string | null; url: string | null };

const LOADING_CONTENT: FileViewerContent = { status: 'loading' };
const BINARY_CONTENT: FileViewerContent = { status: 'ready', text: null, url: null };
const TEXT_KINDS = new Set<FileViewerKind>(['html', 'markdown', 'text']);

// Media is handed to the page as a blob URL. A "PDF" is checked and pinned to
// application/pdf because its iframe cannot be sandboxed (the browser viewer
// refuses sandboxed frames): a mislabeled HTML file must never run there.
const toMediaBlob = async (blob: Blob, kind: FileViewerKind, name: string): Promise<Blob> => {
  if (kind === 'pdf') {
    if (!(await looksLikePdf(blob))) {
      throw new Error('File is not a valid PDF');
    }
    return new Blob([blob], { type: 'application/pdf' });
  }
  const fallbackMime = getPreviewMimeType(name);
  const isGenericType = !blob.type || blob.type === 'application/octet-stream' || blob.type.startsWith('text/plain');
  return isGenericType && fallbackMime ? new Blob([blob], { type: fallbackMime }) : blob;
};

/** Loads what the central viewer shows: text for pages and sources, a blob URL for media, nothing for other binaries. */
export const useFileViewerContent = (target: FileViewerTarget, kind: FileViewerKind, name: string): FileViewerContent => {
  // The last load and the file it belongs to: a result for a previous file is
  // never shown under a new name, it reads as "loading" until its own arrives.
  const [loaded, setLoaded] = useState<{ target: FileViewerTarget; content: FileViewerContent } | null>(null);

  useEffect(() => {
    if (kind === 'binary') {
      return undefined;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    const finish = (content: FileViewerContent) => setLoaded({ target, content });

    const load = async () => {
      try {
        const response = await fetchFileViewerTarget(target, controller.signal);
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        if (TEXT_KINDS.has(kind)) {
          const text = await response.text();
          if (!controller.signal.aborted) finish({ status: 'ready', text, url: null });
          return;
        }
        const blob = await toMediaBlob(await response.blob(), kind, name);
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        finish({ status: 'ready', text: null, url: objectUrl });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Error loading file for the viewer:', error);
        finish({ status: 'error' });
      }
    };
    void load();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [target, kind, name]);

  // Other binaries have nothing to load: the viewer offers the download only.
  if (kind === 'binary') return BINARY_CONTENT;
  return loaded?.target === target ? loaded.content : LOADING_CONTENT;
};
