import { useEffect } from 'react';

import { useWebSocket } from '@/shared/context/WebSocketContext';
import type { SentFileSummary } from '@/shared/types';
import { requestSentFileOpen } from '@/modules/code-editor/utils/sentFiles';

/**
 * Opens a file in the side panel as soon as an agent sends it, like the desktop
 * app does. Files in older transcripts open from their chat card instead.
 * Kept apart from useEditorSidebar so the sidebar works without a websocket.
 */
export const useSentFilesAutoOpen = () => {
  const { subscribe } = useWebSocket();
  useEffect(() => subscribe((event) => {
    if (event.kind !== 'sent_files' || !Array.isArray(event.files) || event.files.length === 0) {
      return;
    }
    requestSentFileOpen(event.files[0] as SentFileSummary);
  }), [subscribe]);
};
