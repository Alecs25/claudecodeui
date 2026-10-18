import assert from 'node:assert/strict';

import { test } from 'vitest';

import { shortModelLabel } from '@/modules/chat/composer/ComposerModelMenu';

test('the model pill shortens catalog names and raw Claude model ids', () => {
  assert.equal(shortModelLabel('Sonnet (1M context)'), 'Sonnet');
  assert.equal(shortModelLabel('claude-opus-5-5'), 'Opus 5.5');
  assert.equal(shortModelLabel('claude-sonnet-5-5[1m]'), 'Sonnet 5.5');
  assert.equal(shortModelLabel('claude-haiku-5'), 'Haiku 5');
  assert.equal(shortModelLabel('Default'), 'Default');
});
