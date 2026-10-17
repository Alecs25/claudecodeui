import assert from 'node:assert/strict';
import test from 'node:test';

const { mapCliOptionsToSDK } = await import('@/modules/providers/list/claude/claude-runtime.provider.js');
const { MARK_CHAPTER_TOOL } = await import('@/modules/chapters/index.js');

// A chapter only draws a divider in the chat; a permission prompt for it would
// stall a turn on a phone for nothing.
test('mark_chapter is always allowed and the session prompt tells the model about it', () => {
  const sdkOptions = mapCliOptionsToSDK({ toolsSettings: { allowedTools: ['Read'], disallowedTools: [], skipPermissions: false } });
  assert.ok(sdkOptions.allowedTools.includes(MARK_CHAPTER_TOOL));
  assert.ok(sdkOptions.allowedTools.includes('Read'));
  assert.ok(sdkOptions.systemPrompt.append.includes(MARK_CHAPTER_TOOL));
});
