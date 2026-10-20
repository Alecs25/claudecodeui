import { useCallback, useEffect, useState } from 'react';

import type { CodeEditorDiffInfo } from '@/shared/types';
import {
  OPEN_FILE_VIEWER_EVENT,
  isHtmlFileName,
  readFileViewerTarget,
  type FileViewerTarget,
} from '@/modules/code-editor/utils/fileViewer';
import { requestSentFileOpen } from '@/modules/code-editor/utils/sentFiles';

type UseFileViewerOptions = {
  projectId: string | null | undefined;
  /** Opens a project file in the side panel: "side by side" and every non-HTML link. */
  openInSidePanel: (filePath: string, diffInfo?: CodeEditorDiffInfo | null, line?: number | null) => void;
};

/**
 * Used by the project-workspace module to own the central file viewer: which
 * file it shows, opening it from the chat card's window event or from a chat
 * link to an HTML file, and handing the file to the side panel.
 */
export const useFileViewer = ({ projectId, openInSidePanel }: UseFileViewerOptions) => {
  // The file on screen in the viewer, or null while it is closed.
  const [viewerTarget, setViewerTarget] = useState<FileViewerTarget | null>(null);

  useEffect(() => {
    const handleOpenRequest = (event: Event) => {
      const target = readFileViewerTarget(event);
      if (target) setViewerTarget(target);
    };
    window.addEventListener(OPEN_FILE_VIEWER_EVENT, handleOpenRequest);
    return () => window.removeEventListener(OPEN_FILE_VIEWER_EVENT, handleOpenRequest);
  }, []);

  const closeViewer = useCallback(() => setViewerTarget(null), []);

  const dockViewerFile = useCallback(() => {
    if (!viewerTarget) return;
    if (viewerTarget.source === 'sent') {
      requestSentFileOpen(viewerTarget.file);
    } else {
      openInSidePanel(viewerTarget.path);
    }
    setViewerTarget(null);
  }, [openInSidePanel, viewerTarget]);

  // Chat links: a plain reference to an HTML file of this project opens
  // rendered in the viewer; a diff or a line jump still means the source.
  const openFileFromLink = useCallback((filePath: string, diffInfo?: CodeEditorDiffInfo | null, line?: number | null) => {
    const name = filePath.replace(/\\/g, '/').split('/').pop() || filePath;
    if (projectId && !diffInfo && !line && isHtmlFileName(name)) {
      setViewerTarget({ source: 'project', name, path: filePath, projectId });
      return;
    }
    openInSidePanel(filePath, diffInfo, line);
  }, [openInSidePanel, projectId]);

  return { viewerTarget, closeViewer, dockViewerFile, openFileFromLink };
};
