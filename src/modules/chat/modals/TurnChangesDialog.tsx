import { useTranslation } from 'react-i18next';

import { Button, Dialog, DialogContent, DialogTitle } from '@/shared/ui';
import type { DiffLine } from '@/shared/types';
import { ToolDiffViewer } from '@/modules/chat/tools/ToolDiffViewer';
import type { TurnFileChange } from '@/modules/chat/utils/turnChanges';

type TurnChangesDialogProps = {
  /** The turn's changes; null keeps the dialog closed. */
  changes: TurnFileChange[] | null;
  onClose: () => void;
  createDiff: (oldStr: string, newStr: string) => DiffLine[];
  onFileOpen?: (filePath: string) => void;
};

/**
 * Rendered by chat's ChatMessagesPane when a turn's "Changes" button is
 * pressed: every file the turn edited, with each change drawn by the same
 * diff viewer the Edit tool rows use.
 */
export default function TurnChangesDialog({ changes, onClose, createDiff, onFileOpen }: TurnChangesDialogProps) {
  const { t } = useTranslation('chat');
  if (!changes) {
    return null;
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[85vh] w-[min(56rem,calc(100vw-2rem))] max-w-none flex-col p-4 sm:p-5">
        <DialogTitle className="not-sr-only text-base font-semibold text-foreground">
          {t('turnChanges.title', { count: changes.length, defaultValue: 'Changes ({{count}} files)' })}
        </DialogTitle>
        <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto">
          {changes.map((change) => (
            <section key={change.filePath} className="space-y-1.5">
              <h3 className="break-all font-mono text-xs font-medium text-foreground">{change.filePath}</h3>
              {change.edits.map((edit, index) => (
                <ToolDiffViewer
                  key={index}
                  oldContent={edit.oldContent}
                  newContent={edit.newContent}
                  filePath={change.filePath}
                  createDiff={createDiff}
                  onFileClick={onFileOpen ? () => onFileOpen(change.filePath) : undefined}
                  badge={edit.kind === 'write'
                    ? t('turnChanges.written', { defaultValue: 'Written' })
                    : t('turnChanges.edit', { defaultValue: 'Edit' })}
                  badgeColor={edit.kind === 'write' ? 'green' : 'gray'}
                />
              ))}
            </section>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('turnChanges.close', { defaultValue: 'Close' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
