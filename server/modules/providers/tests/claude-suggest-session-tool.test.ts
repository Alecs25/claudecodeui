import assert from 'node:assert/strict';
import test from 'node:test';

const { mapCliOptionsToSDK } = await import('@/modules/providers/list/claude/claude-runtime.provider.js');
const { SUGGEST_SESSION_TOOL } = await import('@/modules/session-suggestions/index.js');

// A suggestion only draws a card the user decides about later; a permission
// prompt for it would stall the turn for nothing.
test('suggest_session is always allowed and the session prompt tells the model about it', () => {
  const sdkOptions = mapCliOptionsToSDK({ toolsSettings: { allowedTools: [], disallowedTools: [], skipPermissions: false } });
  assert.ok(sdkOptions.allowedTools.includes(SUGGEST_SESSION_TOOL));
  assert.ok(sdkOptions.systemPrompt.append.includes(SUGGEST_SESSION_TOOL));
});
