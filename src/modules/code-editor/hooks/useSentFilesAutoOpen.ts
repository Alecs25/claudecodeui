import { useEffect, useRef } from 'react';

import { useOptionalUiPreferences } from '@/shared/context/UiPreferencesContext';
import { useWebSocket } from '@/shared/context/WebSocketContext';
import { markSentFileFresh, shouldAutoOpenSentFiles } from '@/modules/code-editor/utils/fileViewer';

/**
 * Opens a file in the central viewer as soon as an agent sends it, like the
 * desktop app does. The websocket event carries no session, so it only marks
 * the first file fresh: the chat card that mounts for it in the transcript on
 * screen opens it (SentFilesCard), and a card in another session never mounts.
 * On screens narrower than a laptop the card alone is shown, the viewer would
 * cover the chat. Kept apart from useFileViewer so that works without a websocket.
 */
export const useSentFilesAutoOpen = () => {
  const { subscribe } = useWebSocket();
  const enabled = useOptionalUiPreferences()?.autoOpenSentFiles ?? true;
  // Read inside the subscription, so toggling the setting does not resubscribe.
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => subscribe((event) => {
    if (event.kind !== 'sent_files' || !Array.isArray(event.files) || event.files.length === 0) {
      return;
    }
    const conditions = {
      enabled: enabledRef.current,
      viewportWidth: window.innerWidth,
      pageVisible: document.visibilityState === 'visible',
    };
    const firstFileId = (event.files[0] as { id?: unknown })?.id;
    if (typeof firstFileId === 'string' && shouldAutoOpenSentFiles(conditions)) {
      markSentFileFresh(firstFileId);
    }
  }), [subscribe]);
};
