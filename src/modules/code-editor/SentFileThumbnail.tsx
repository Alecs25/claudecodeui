import { FileText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { api } from '@/shared/api';
import { HTML_PREVIEW_SANDBOX } from '@/shared/constants';
import type { SentFileSummary } from '@/shared/types';
import { PAGE_WIDTH_PRESETS, getFileViewerKind } from '@/modules/code-editor/utils/fileViewer';

type SentFileThumbnailProps = {
  file: SentFileSummary;
  label: string;
  onOpen: () => void;
};

type Thumbnail =
  | { status: 'idle' | 'loading' | 'failed' }
  | { status: 'html'; html: string }
  | { status: 'image'; url: string };

const THUMBNAIL_HEIGHT_PX = 110;
const THUMBNAIL_PAGE_WIDTH = PAGE_WIDTH_PRESETS.desktop;

/**
 * Rendered by SentFilesCard: the top of an HTML page at desktop width, or the
 * picture, scaled into a short strip. Loaded once the card scrolls into view;
 * not interactive (a tap opens the viewer), icon when it cannot be loaded.
 */
export default function SentFileThumbnail({ file, label, onOpen }: SentFileThumbnailProps) {
  const containerRef = useRef<HTMLButtonElement | null>(null);
  const kind = getFileViewerKind(file.name);
  // What the strip shows: nothing until visible, then the page, the picture or the fallback icon.
  const [thumbnail, setThumbnail] = useState<Thumbnail>({ status: 'idle' });
  // The strip's width, measured: the desktop-wide page is scaled down to it.
  const [stripWidth, setStripWidth] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    setStripWidth(element.clientWidth);
    if (typeof IntersectionObserver === 'undefined') {
      setThumbnail((current) => (current.status === 'idle' ? { status: 'loading' } : current));
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setThumbnail((current) => (current.status === 'idle' ? { status: 'loading' } : current));
        observer.disconnect();
      }
    }, { rootMargin: '200px' });
    observer.observe(element);
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => setStripWidth(element.clientWidth));
    resizeObserver?.observe(element);
    return () => {
      observer.disconnect();
      resizeObserver?.disconnect();
    };
  }, []);

  const shouldLoad = thumbnail.status === 'loading';
  useEffect(() => {
    if (!shouldLoad) return undefined;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    const load = async () => {
      try {
        const response = await api.readSentFileContent(file.id, { signal: controller.signal });
        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
        if (kind === 'html') {
          const html = await response.text();
          if (!controller.signal.aborted) setThumbnail({ status: 'html', html });
          return;
        }
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: file.mimeType }));
        setThumbnail({ status: 'image', url: objectUrl });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn('Sent file thumbnail unavailable:', error);
        setThumbnail({ status: 'failed' });
      }
    };
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, file.mimeType, kind, shouldLoad]);

  const scale = stripWidth > 0 ? stripWidth / THUMBNAIL_PAGE_WIDTH : 0;

  return (
    <button
      ref={containerRef}
      type="button"
      onClick={onOpen}
      aria-label={label}
      title={label}
      data-testid="sent-file-thumbnail"
      className="relative block w-full overflow-hidden border-t border-border bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      style={{ height: THUMBNAIL_HEIGHT_PX }}
    >
      {thumbnail.status === 'html' && scale > 0 && (
        <iframe
          title={label}
          sandbox={HTML_PREVIEW_SANDBOX}
          srcDoc={thumbnail.html}
          referrerPolicy="no-referrer"
          loading="lazy"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 border-0 bg-white"
          style={{
            width: THUMBNAIL_PAGE_WIDTH,
            height: THUMBNAIL_HEIGHT_PX / scale,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />
      )}
      {thumbnail.status === 'image' && (
        <img src={thumbnail.url} alt="" className="h-full w-full object-cover object-top" />
      )}
      {(thumbnail.status === 'failed' || thumbnail.status === 'idle' || thumbnail.status === 'loading') && (
        <span className="flex h-full w-full items-center justify-center text-muted-foreground" data-testid="sent-file-thumbnail-fallback">
          <FileText className="h-6 w-6" aria-hidden="true" />
        </span>
      )}
    </button>
  );
}
