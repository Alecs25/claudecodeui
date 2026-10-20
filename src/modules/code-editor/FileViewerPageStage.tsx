import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { HTML_PREVIEW_SANDBOX } from '@/shared/constants';
import { computePageFit } from '@/modules/code-editor/utils/fileViewer';

type FileViewerPageStageProps = {
  content: string;
  title: string;
  /** Page width in CSS px; null lays the page out at the stage's own width (phones). */
  pageWidth: number | null;
};

const STAGE_PADDING_PX = 16;
// Room under the page for the "ask Claude" field docked over the stage.
const ASK_BAR_CLEARANCE_PX = 64;

/** Rendered by FileViewer: an HTML page at a device width, scaled down to fit and centred on a checkered stage. */
export default function FileViewerPageStage({ content, title, pageWidth }: FileViewerPageStageProps) {
  const isFillLayout = pageWidth === null;
  const stageRef = useRef<HTMLDivElement | null>(null);
  // The stage's inner size, measured: the scale depends on the space the layout gives the viewer.
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const measure = () => setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
    // The stage element differs between the fill and the device-width layouts.
  }, [isFillLayout]);

  const iframe = (style: CSSProperties) => (
    <iframe
      title={title}
      sandbox={HTML_PREVIEW_SANDBOX}
      srcDoc={content}
      referrerPolicy="no-referrer"
      className="block border-0 bg-white"
      style={style}
    />
  );

  if (pageWidth === null) {
    return (
      <div ref={stageRef} className="min-h-0 flex-1 bg-white" style={{ paddingBottom: ASK_BAR_CLEARANCE_PX }}>
        {iframe({ width: '100%', height: '100%' })}
      </div>
    );
  }

  const fit = stageSize
    ? computePageFit(
      pageWidth,
      stageSize.width - STAGE_PADDING_PX * 2,
      stageSize.height - STAGE_PADDING_PX - ASK_BAR_CLEARANCE_PX,
    )
    : null;

  return (
    <div
      ref={stageRef}
      data-testid="file-viewer-stage"
      className="flex min-h-0 flex-1 justify-center overflow-hidden"
      style={{
        padding: `${STAGE_PADDING_PX}px ${STAGE_PADDING_PX}px ${ASK_BAR_CLEARANCE_PX}px`,
        background: 'repeating-conic-gradient(hsl(var(--muted)) 0 25%, hsl(var(--background)) 0 50%) 0 0 / 18px 18px',
      }}
    >
      {fit && (
        <div
          data-testid="file-viewer-page"
          className="shrink-0 overflow-hidden rounded-md shadow-lg"
          style={{ width: fit.boxWidth, height: fit.boxHeight }}
        >
          {iframe({
            width: pageWidth,
            height: fit.frameHeight,
            transform: `scale(${fit.scale})`,
            transformOrigin: 'top left',
          })}
        </div>
      )}
    </div>
  );
}
