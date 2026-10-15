import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useTheme } from '@/shared/context/ThemeContext';
import { useIsExportingTranscript } from '@/modules/chat/context/TranscriptRenderContext';
import {
  buildWidgetDocument,
  isSafeWidgetLink,
  parseWidgetBridgeMessage,
  requestWidgetPrompt,
} from '@/modules/chat/utils/inlineWidget';

type InlineWidgetProps = {
  widgetCode: string;
  title: string;
};

const INITIAL_HEIGHT_PX = 120;
// A widget reporting a runaway height (e.g. a loop appending rows) must not
// stretch the transcript without bound.
const MAX_HEIGHT_PX = 4000;

/**
 * The live frame. `sandbox="allow-scripts"` without `allow-same-origin` gives
 * the fragment an opaque origin: it runs its own scripts but cannot reach
 * CloudCLI's storage, cookies, token or DOM.
 */
const InlineWidgetFrame: React.FC<InlineWidgetProps> = ({ widgetCode, title }) => {
  const { isDarkMode } = useTheme();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(INITIAL_HEIGHT_PX);
  const document = useMemo(() => buildWidgetDocument(widgetCode, isDarkMode), [widgetCode, isDarkMode]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only the frame this component owns can drive it.
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) {
        return;
      }
      const message = parseWidgetBridgeMessage(event.data);
      if (!message) {
        return;
      }
      if (message.type === 'resize') {
        setHeight(Math.min(Math.max(message.height, 1), MAX_HEIGHT_PX));
        return;
      }
      if (message.type === 'send-prompt') {
        requestWidgetPrompt(message.text);
        return;
      }
      if (isSafeWidgetLink(message.url)) {
        window.open(message.url, '_blank', 'noopener,noreferrer');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <iframe
      ref={frameRef}
      title={title || 'Widget'}
      sandbox="allow-scripts"
      srcDoc={document}
      className="block w-full border-0 bg-transparent"
      style={{ height }}
    />
  );
};

/**
 * A show_widget fragment drawn inline in the transcript, like the visuals in
 * Claude's apps. An exported transcript has no live frame, so it keeps a line
 * naming the widget instead.
 */
export const InlineWidget: React.FC<InlineWidgetProps> = ({ widgetCode, title }) => {
  const isExporting = useIsExportingTranscript();
  if (isExporting) {
    return <div className="text-xs italic text-muted-foreground">{title || 'Widget'}</div>;
  }
  return (
    <div className="my-1 w-full">
      <InlineWidgetFrame widgetCode={widgetCode} title={title} />
    </div>
  );
};
