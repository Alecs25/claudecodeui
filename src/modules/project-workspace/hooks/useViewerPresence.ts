import { useContext, useEffect, useRef } from 'react';

import WebSocketContext from '@/shared/context/WebSocketContext';

/**
 * Tells the server which sessions this tab shows and whether the tab is
 * visible, as a `client.presence` frame.
 *
 * The server uses it to leave a run that ends on screen read, to skip the push
 * and desktop notification for it, and to read a session the moment it is
 * opened. It is resent whenever the shown sessions or the tab's visibility
 * change, and after every (re)connect, because the server forgets a socket's
 * presence when the socket closes.
 */
export function useViewerPresence(sessionIds: readonly string[]): void {
  // Read null-safely: outside the socket provider (tests) there is nobody to tell.
  const socket = useContext(WebSocketContext);
  const sendMessage = socket?.sendMessage;
  const isConnected = Boolean(socket?.isConnected);
  // Joined into one string so a new array with the same ids does not resend.
  const sessionKey = sessionIds.join('\n');
  const sessionKeyRef = useRef(sessionKey);
  sessionKeyRef.current = sessionKey;

  useEffect(() => {
    if (!isConnected || !sendMessage) {
      return undefined;
    }

    const report = () => {
      sendMessage({
        type: 'client.presence',
        sessionIds: sessionKeyRef.current ? sessionKeyRef.current.split('\n') : [],
        visible: document.visibilityState === 'visible',
      });
    };

    report();
    document.addEventListener('visibilitychange', report);
    return () => document.removeEventListener('visibilitychange', report);
  }, [isConnected, sendMessage, sessionKey]);
}
