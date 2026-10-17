import assert from 'node:assert/strict';

import { test } from 'vitest';

import { readToolDenial } from '@/modules/chat/utils/toolDenial';

test('a settings refusal keeps its reason, rule included', () => {
  assert.deepEqual(
    readToolDenial({ isError: true, content: 'Tool disallowed by settings (Bash(rm:*))' }),
    { reason: 'Tool disallowed by settings (Bash(rm:*))' },
  );
  assert.deepEqual(
    readToolDenial({ isError: true, content: 'Permission request timed out' }),
    { reason: 'Permission request timed out' },
  );
});

test('a CLI rejection with user feedback shows what the user said', () => {
  const content = "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). To tell you how to proceed, the user said:\nuse the staging database instead";
  assert.deepEqual(readToolDenial({ isError: true, content }), { reason: 'use the staging database instead' });
});

test('a bare deny is a refusal without a reason', () => {
  assert.deepEqual(readToolDenial({ isError: true, content: 'User denied tool use' }), { reason: null });
  assert.deepEqual(
    readToolDenial({ isError: true, content: "The user doesn't want to proceed with this tool use. The tool use was rejected. STOP what you are doing." }),
    { reason: null },
  );
  // The Deny message in another language counts once the caller names it.
  assert.equal(readToolDenial({ isError: true, content: 'Uživatel zamítl použití nástroje' }), null);
  assert.deepEqual(
    readToolDenial({ isError: true, content: 'Uživatel zamítl použití nástroje' }, ['Uživatel zamítl použití nástroje']),
    { reason: null },
  );
});

test('a tool that ran and failed is not a refusal', () => {
  assert.equal(readToolDenial({ isError: true, content: 'ssh: Permission denied (publickey).' }), null);
  assert.equal(readToolDenial({ isError: false, content: 'User denied tool use' }), null);
  assert.equal(readToolDenial(null), null);
});
