import { useState } from 'react';
import { Download, FileText, PanelRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { api } from '@/shared/api';
import type { SentFileSummary } from '@/shared/types';
import { requestSentFileOpen } from '@/modules/code-editor/utils/sentFiles';

type SentFilesCardProps = {
  files: SentFileSummary[];
  caption?: string | null;
};

const BYTES_PER_KB = 1024;

const formatSize = (bytes: number) => {
  if (bytes < BYTES_PER_KB) return `${bytes} B`;
  if (bytes < BYTES_PER_KB * BYTES_PER_KB) return `${(bytes / BYTES_PER_KB).toFixed(1)} KB`;
  return `${(bytes / BYTES_PER_KB / BYTES_PER_KB).toFixed(1)} MB`;
};

/** Rendered by chat's ToolRenderer for send_user_file results: one row per file the agent sent, with open-in-panel and download. */
export default function SentFilesCard({ files, caption }: SentFilesCardProps) {
  const { t } = useTranslation('codeEditor');
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async (file: SentFileSummary) => {
    setDownloadError(null);
    // The content endpoint needs the auth header, so a plain link would 401.
    const response = await api.readSentFileContent(file.id);
    if (!response.ok) {
      setDownloadError(t('sentFiles.downloadError', 'Download failed'));
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border bg-background">
      {caption && <div className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">{caption}</div>}
      {files.map((file) => (
        <div key={file.id} className="flex items-center gap-2 px-3 py-2 [&+&]:border-t [&+&]:border-border">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <button
            type="button"
            onClick={() => requestSentFileOpen(file)}
            className="min-w-0 flex-1 truncate text-left text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
            title={t('sentFiles.open', 'Open in side panel')}
          >
            {file.name}
          </button>
          <span className="shrink-0 text-xs text-muted-foreground">{formatSize(file.size)}</span>
          <button
            type="button"
            onClick={() => requestSentFileOpen(file)}
            className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            title={t('sentFiles.open', 'Open in side panel')}
            aria-label={t('sentFiles.open', 'Open in side panel')}
          >
            <PanelRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void handleDownload(file)}
            className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            title={t('actions.download')}
            aria-label={t('actions.download')}
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      ))}
      {downloadError && <div className="px-3 pb-2 text-xs text-red-600 dark:text-red-400">{downloadError}</div>}
    </div>
  );
}
