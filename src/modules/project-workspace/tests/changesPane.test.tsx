import assert from 'node:assert/strict';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { test, vi } from 'vitest';

/**
 * The Changes pane lists the uncommitted files with their counts; opening one
 * shows its diff, a click on a line opens a comment box under it, and "Send
 * to Claude" hands every comment over as one message.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

const diffMock = vi.hoisted(() => vi.fn());
vi.mock('@/shared/api', () => ({ api: { git: { diff: diffMock } } }));

const { default: ChangesPane } = await import('@/modules/project-workspace/side-pane/ChangesPane');

const DIFF = '@@ -10,2 +10,2 @@\n context\n-old line\n+new line';

test('a comment on a diff line is sent with file, line and quote', async () => {
  diffMock.mockResolvedValue({ ok: true, json: async () => ({ diff: DIFF }) });
  const onSendComments = vi.fn();
  const onRefresh = vi.fn();
  render(
    <ChangesPane
      projectId="project-1"
      changes={{ branch: 'main', added: 1, deleted: 1, files: [{ path: 'src/task.py', added: 1, deleted: 1, status: 'modified' }] }}
      onRefresh={onRefresh}
      onSendComments={onSendComments}
      isMobile={false}
    />,
  );
  assert.equal(onRefresh.mock.calls.length, 1);

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /src\/task\.py/ }));
  });
  assert.deepEqual(diffMock.mock.calls[0], ['project-1', 'src/task.py']);

  fireEvent.click(screen.getByRole('button', { name: '+new line' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Comment' }), { target: { value: 'check the zone' } });
  fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
  assert.ok(screen.getByText('check the zone'));

  fireEvent.click(screen.getByRole('button', { name: 'Send to Claude' }));
  assert.deepEqual(onSendComments.mock.calls[0], [
    'Comments on the changes:\n\n`src/task.py:11`\n> +new line\ncheck the zone',
  ]);
  assert.equal(screen.queryByText('check the zone'), null);
});
