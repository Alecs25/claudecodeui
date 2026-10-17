import assert from 'node:assert/strict';

import { test } from 'vitest';

import { applySessionStatusToProject } from '@/modules/project-workspace/hooks/useProjectsState';
import type { Project } from '@/shared/types';

/**
 * A `session_status` frame rewrites only the flags of the row it names, and
 * leaves every other project untouched by identity so the sidebar list does not
 * re-render for them.
 */

const project = (sessions: Project['sessions']): Project => ({
  projectId: 'p1',
  path: '/tmp/p1',
  fullPath: '/tmp/p1',
  displayName: 'p1',
  sessions,
  sessionMeta: { hasMore: false, total: sessions?.length ?? 0 },
} as Project);

const FLAGS = { isPinned: true, isUnread: false, isCompleted: false };

test('the named row gets the new flags and keeps the rest of its fields', () => {
  const before = project([{ id: 's1', summary: 'one' }, { id: 's2', summary: 'two' }]);

  const after = applySessionStatusToProject(before, 's1', FLAGS);

  assert.notEqual(after, before);
  assert.deepEqual(after.sessions?.[0], { id: 's1', summary: 'one', ...FLAGS });
  assert.equal(after.sessions?.[1], before.sessions?.[1]);
});

test('a project without the row, or with the same flags, is returned as is', () => {
  const unrelated = project([{ id: 's9' }]);
  assert.equal(applySessionStatusToProject(unrelated, 's1', FLAGS), unrelated);

  const same = project([{ id: 's1', ...FLAGS }]);
  assert.equal(applySessionStatusToProject(same, 's1', FLAGS), same);
});
