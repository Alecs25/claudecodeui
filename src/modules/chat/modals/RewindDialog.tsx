import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Dialog, DialogContent, DialogTitle } from '@/shared/ui';
import type { ChatMessage, FileRewindResult } from '@/shared/types';

type RewindDialogProps = {
  /** The user message being rewound to; null keeps the dialog closed. */
  message: ChatMessage | null;
  /** Whether the provider checkpoints files, which is what offers the file options. */
  supportsFiles: boolean;
  onClose: () => void;
  /** Puts the conversation back to just before the message (the edit flow). */
  onRewindConversation: (message: ChatMessage) => void;
  /** Restores files to their state before the message, or previews it. */
  rewindFiles: (anchorId: string, dryRun: boolean) => Promise<FileRewindResult>;
};

type RewindMode = 'files' | 'both';

/**
 * Rendered by chat's ChatInterface for "Rewind to here" on a user message,
 * offering Claude Code's choices: the conversation, the files, or both.
 *
 * A file restore overwrites the working tree, so it never runs straight from
 * the first click: it previews what would change and waits for a second,
 * explicit confirmation. The conversation half only reloads the message into
 * the composer, as editing does; nothing is cut until the next send.
 */
export default function RewindDialog({
  message,
  supportsFiles,
  onClose,
  onRewindConversation,
  rewindFiles,
}: RewindDialogProps) {
  const { t } = useTranslation('chat');
  // Which file option was picked; set once its dry run is being shown.
  const [mode, setMode] = useState<RewindMode | null>(null);
  // The dry run's answer: what the confirmation lists.
  const [preview, setPreview] = useState<FileRewindResult | null>(null);
  // True while a request to the server is out, to block double submits.
  const [isWorking, setIsWorking] = useState(false);
  // Last failure, shown inline so the dialog stays open to retry or cancel.
  const [error, setError] = useState<string | null>(null);

  const anchorId = message?.transcriptAnchorId ?? null;

  // A new message starts the dialog over.
  useEffect(() => {
    setMode(null);
    setPreview(null);
    setIsWorking(false);
    setError(null);
  }, [anchorId]);

  if (!message || !anchorId) {
    return null;
  }

  const previewFiles = async (nextMode: RewindMode) => {
    setIsWorking(true);
    setError(null);
    try {
      const result = await rewindFiles(anchorId, true);
      if (!result.canRewind) {
        setError(result.error || t('rewind.unavailable', { defaultValue: 'No file checkpoint for this message.' }));
        return;
      }
      setMode(nextMode);
      setPreview(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsWorking(false);
    }
  };

  const confirmFiles = async () => {
    if (!mode) return;
    setIsWorking(true);
    setError(null);
    try {
      const result = await rewindFiles(anchorId, false);
      if (!result.canRewind) {
        setError(result.error || t('rewind.unavailable', { defaultValue: 'No file checkpoint for this message.' }));
        return;
      }
      if (mode === 'both') {
        onRewindConversation(message);
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsWorking(false);
    }
  };

  const changedFiles = preview?.filesChanged ?? [];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent aria-describedby="rewind-dialog-description" className="p-5">
        <DialogTitle className="not-sr-only text-base font-semibold text-foreground">
          {t('rewind.title', { defaultValue: 'Rewind to here' })}
        </DialogTitle>

        {preview ? (
          <>
            <p id="rewind-dialog-description" className="mt-3 text-sm text-muted-foreground">
              {changedFiles.length > 0
                ? t('rewind.confirmFiles', {
                    count: changedFiles.length,
                    insertions: preview.insertions ?? 0,
                    deletions: preview.deletions ?? 0,
                    defaultValue: 'Restore {{count}} files (+{{insertions}} −{{deletions}})?',
                  })
                : t('rewind.noFileChanges', { defaultValue: 'No files to restore.' })}
            </p>
            {changedFiles.length > 0 && (
              <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto rounded border border-border/60 bg-muted/30 p-2 font-mono text-xs text-foreground/90">
                {changedFiles.map((file) => (
                  <li key={file} className="break-all">{file}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p id="rewind-dialog-description" className="mt-3 line-clamp-3 text-sm text-muted-foreground">
            {message.content}
          </p>
        )}

        {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('rewind.cancel', { defaultValue: 'Cancel' })}
          </Button>
          {preview ? (
            <Button
              type="button"
              variant="destructive"
              disabled={isWorking || (changedFiles.length === 0 && mode === 'files')}
              onClick={() => void confirmFiles()}
            >
              {mode === 'both'
                ? t('rewind.restoreBoth', { defaultValue: 'Restore files and conversation' })
                : t('rewind.restoreFiles', { defaultValue: 'Restore files' })}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="default"
                disabled={isWorking}
                onClick={() => {
                  onRewindConversation(message);
                  onClose();
                }}
              >
                {t('rewind.conversationOnly', { defaultValue: 'Conversation only' })}
              </Button>
              {supportsFiles && (
                <>
                  <Button type="button" variant="outline" disabled={isWorking} onClick={() => void previewFiles('files')}>
                    {t('rewind.filesOnly', { defaultValue: 'Files only' })}
                  </Button>
                  <Button type="button" variant="outline" disabled={isWorking} onClick={() => void previewFiles('both')}>
                    {t('rewind.conversationAndFiles', { defaultValue: 'Conversation and files' })}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
