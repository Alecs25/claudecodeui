import { createContext, useContext } from 'react';

/**
 * True in the Verbose transcript mode, where every tool call is shown expanded
 * with its raw input. Provided by ChatMessagesPane so the tool rows deep in the
 * tree (groups, collapsible sections, command rows) can open themselves without
 * a prop threaded through every renderer.
 */
const TranscriptVerboseContext = createContext(false);

export function useIsVerboseTranscript(): boolean {
  return useContext(TranscriptVerboseContext);
}

export default TranscriptVerboseContext;
