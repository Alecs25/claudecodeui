import assert from 'node:assert/strict';

import { render, screen } from '@testing-library/react';
import { test } from 'vitest';

import '@/modules/i18n';
import PermissionRequestsBanner from '@/modules/chat/composer/PermissionRequestsBanner';
import type { PendingPermissionRequest } from '@/shared/types';

/**
 * Several pending permission prompts are answered one at a time, oldest first,
 * with how many are waiting, and each shows what the call would do.
 */

const noop = () => ({ success: true });

test('shows only the oldest pending request, with its position and its command', () => {
  const requests: PendingPermissionRequest[] = [
    { requestId: 'r2', toolName: 'Edit', input: { file_path: '/repo/src/app.ts' }, receivedAt: new Date('2026-01-01T00:00:02Z') },
    { requestId: 'r1', toolName: 'Bash', input: { command: 'npm run deploy' }, receivedAt: new Date('2026-01-01T00:00:01Z') },
    { requestId: 'r3', toolName: 'WebFetch', input: { url: 'https://example.com' }, receivedAt: new Date('2026-01-01T00:00:03Z') },
  ];

  render(
    <PermissionRequestsBanner
      pendingPermissionRequests={requests}
      handlePermissionDecision={() => undefined}
      handleGrantToolPermission={noop}
    />,
  );

  assert.equal(screen.getByTestId('permission-queue-position').textContent, '1 of 3');
  assert.equal(screen.getByTestId('permission-subject').textContent, 'npm run deploy');
  assert.equal(screen.queryByText('/repo/src/app.ts'), null, 'later requests wait their turn');
});

test('a single request shows no position', () => {
  render(
    <PermissionRequestsBanner
      pendingPermissionRequests={[{ requestId: 'r1', toolName: 'Write', input: { file_path: '/repo/README.md', content: 'x' } }]}
      handlePermissionDecision={() => undefined}
      handleGrantToolPermission={noop}
    />,
  );

  assert.equal(screen.queryByTestId('permission-queue-position'), null);
  assert.equal(screen.getByTestId('permission-subject').textContent, '/repo/README.md');
});
