import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  annotateDiffLines,
  buildDiffCommentsPrompt,
  commentLineNumber,
} from '@/modules/project-workspace/utils/diffComments';

const DIFF = [
  'diff --git a/task.py b/task.py',
  '@@ -212,3 +212,4 @@ class Task:',
  ' def _deadline_local_date(self):',
  '-    return self.date_deadline.date()',
  '+    tz = self.env.user.tz or "UTC"',
  '+    return local.date()',
  ' ',
].join('\n');

test('diff lines are numbered from the hunk header, deletions by the old file', () => {
  const lines = annotateDiffLines(DIFF);
  assert.deepEqual(lines.map((line) => line.kind), ['meta', 'hunk', 'context', 'deleted', 'added', 'added', 'context']);
  assert.deepEqual(lines.map(commentLineNumber), [null, null, 212, 213, 213, 214, 215]);
});

test('the prompt lists every comment as file:line, quoted line and text, in file and line order', () => {
  const prompt = buildDiffCommentsPrompt([
    { id: '2', filePath: 'task.py', lineIndex: 5, line: 214, lineText: '+    return local.date()', text: 'use the company zone too ' },
    { id: '1', filePath: 'b.py', lineIndex: 2, line: 3, lineText: '', text: 'rename' },
    { id: '3', filePath: 'task.py', lineIndex: 3, line: 213, lineText: '-    return self.date_deadline.date()', text: 'why?' },
  ], 'Comments on the changes:');

  assert.equal(prompt, [
    'Comments on the changes:',
    '`b.py:3`\nrename',
    '`task.py:213`\n> -    return self.date_deadline.date()\nwhy?',
    '`task.py:214`\n> +    return local.date()\nuse the company zone too',
  ].join('\n\n'));
});
