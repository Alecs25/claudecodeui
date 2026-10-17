import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import '@/modules/i18n';
import RewindDialog from '@/modules/chat/modals/RewindDialog';
import type { ChatMessage, FileRewindResult } from '@/shared/types';

const MESSAGE: ChatMessage = {
  type: 'user',
  content: 'Refactor the parser',
  timestamp: new Date('2026-10-17T10:00:00Z'),
  transcriptAnchorId: 'user-uuid-1',
};

type RewindFiles = (anchorId: string, dryRun: boolean) => Promise<FileRewindResult>;

function renderDialog(rewindFiles: RewindFiles = vi.fn(), supportsFiles = true) {
  const onClose = vi.fn();
  const onRewindConversation = vi.fn();
  render(
    <RewindDialog
      message={MESSAGE}
      supportsFiles={supportsFiles}
      onClose={onClose}
      onRewindConversation={onRewindConversation}
      rewindFiles={rewindFiles}
    />,
  );
  return { onClose, onRewindConversation };
}

describe('the rewind dialog', () => {
  it('rewinds only the conversation without touching files', () => {
    const rewindFiles = vi.fn<RewindFiles>();
    const { onClose, onRewindConversation } = renderDialog(rewindFiles);

    fireEvent.click(screen.getByRole('button', { name: 'Conversation only' }));

    expect(onRewindConversation).toHaveBeenCalledWith(MESSAGE);
    expect(onClose).toHaveBeenCalled();
    expect(rewindFiles).not.toHaveBeenCalled();
  });

  it('previews the files, then restores them and the conversation on confirmation', async () => {
    const rewindFiles = vi.fn<RewindFiles>(async (_anchorId, dryRun) => (
      dryRun
        ? { canRewind: true, filesChanged: ['/repo/a.ts', '/repo/b.ts'], insertions: 3, deletions: 5 }
        : { canRewind: true }
    ));
    const { onClose, onRewindConversation } = renderDialog(rewindFiles);

    fireEvent.click(screen.getByRole('button', { name: 'Conversation and files' }));
    await screen.findByText('/repo/a.ts');
    expect(rewindFiles).toHaveBeenCalledWith('user-uuid-1', true);
    expect(onRewindConversation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Restore files and conversation' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(rewindFiles).toHaveBeenLastCalledWith('user-uuid-1', false);
    expect(onRewindConversation).toHaveBeenCalledWith(MESSAGE);
  });

  it('restoring files only leaves the conversation alone', async () => {
    const rewindFiles = vi.fn<RewindFiles>(async () => ({ canRewind: true, filesChanged: ['/repo/a.ts'], insertions: 1, deletions: 0 }));
    const { onClose, onRewindConversation } = renderDialog(rewindFiles);

    fireEvent.click(screen.getByRole('button', { name: 'Files only' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore files' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onRewindConversation).not.toHaveBeenCalled();
  });

  it('explains when the session kept no checkpoint', async () => {
    const rewindFiles = vi.fn<RewindFiles>(async () => ({ canRewind: false, error: 'No file checkpoint found for this message.' }));
    renderDialog(rewindFiles);

    fireEvent.click(screen.getByRole('button', { name: 'Files only' }));

    expect((await screen.findByRole('alert')).textContent).toBe('No file checkpoint found for this message.');
  });

  it('offers no file options when the provider cannot restore files', () => {
    renderDialog(vi.fn<RewindFiles>(), false);

    expect(screen.queryByRole('button', { name: 'Files only' })).toBeNull();
  });
});
