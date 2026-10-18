import { ArrowLeft, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MutableRefObject, PointerEvent, ReactNode } from 'react';

type WorkspaceSidePaneProps = {
  title: string;
  isMobile: boolean;
  width: number;
  resizeHandleRef: MutableRefObject<HTMLDivElement | null>;
  onResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
  onClose: () => void;
  children: ReactNode;
};

// The chat keeps at least this much room however wide the pane is dragged.
const MIN_CHAT_WIDTH_PX = 240;
const MIN_PANE_WIDTH_PX = 280;

/**
 * Rendered by WorkspaceMain for the pane the toolbar opened: docked at the
 * right of the chat from 768px, sharing the editor's width and drag handle so
 * both read as one right column; full screen with a back arrow on a phone.
 * The handle sits in the same place in the DOM as the editor's, which is what
 * useEditorSidebar's resize measures from.
 */
export default function WorkspaceSidePane({
  title,
  isMobile,
  width,
  resizeHandleRef,
  onResizeStart,
  onClose,
  children,
}: WorkspaceSidePaneProps) {
  const { t } = useTranslation();

  if (isMobile) {
    return (
      <div role="dialog" aria-label={title} className="pwa-header-safe fixed inset-0 z-40 flex flex-col bg-background">
        <div className="flex h-12 flex-shrink-0 items-center gap-1 border-b border-border/60 px-1.5">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('panes.back', { defaultValue: 'Back' })}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">{title}</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-shrink-0"
      // A percentage of the chat row, so the chat keeps its room beside the sidebar.
      style={{ width: `${width}px`, minWidth: `${MIN_PANE_WIDTH_PX}px`, maxWidth: `calc(100% - ${MIN_CHAT_WIDTH_PX}px)` }}
    >
      <div
        ref={resizeHandleRef}
        onPointerDown={onResizeStart}
        className="group relative w-1 flex-shrink-0 cursor-col-resize touch-none bg-border/60 transition-colors hover:bg-primary/60"
        title={t('panes.resize', { defaultValue: 'Drag to resize' })}
      >
        {/* Wider invisible grab area for touch; the visible line stays 4px. */}
        <div className="absolute inset-y-0 -left-2 -right-2 z-10" />
      </div>
      <section
        aria-label={title}
        className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background"
      >
        <div className="flex h-10 flex-shrink-0 items-center gap-2 border-b border-border/60 pl-3 pr-1">
          <h2 className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('panes.close', { defaultValue: 'Close' })}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </section>
    </div>
  );
}
