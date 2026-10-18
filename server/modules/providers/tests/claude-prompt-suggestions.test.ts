import assert from 'node:assert/strict';
import test from 'node:test';

const { mapCliOptionsToSDK, readPromptSuggestion } = await import('@/modules/providers/list/claude/claude-runtime.provider.js');

// Only a chat composer shows the suggestion, so only its sends ask for one.
test('prompt suggestions are requested only when the send opts in', () => {
  assert.equal(mapCliOptionsToSDK({ promptSuggestions: true }).promptSuggestions, true);
  assert.equal(mapCliOptionsToSDK({ promptSuggestions: false }).promptSuggestions, undefined);
  assert.equal(mapCliOptionsToSDK({}).promptSuggestions, undefined);
});

test('readPromptSuggestion keeps a short trimmed suggestion and drops the rest', () => {
  assert.equal(readPromptSuggestion({ type: 'prompt_suggestion', suggestion: '  run the tests  ' }), 'run the tests');
  assert.equal(readPromptSuggestion({ type: 'prompt_suggestion', suggestion: '   ' }), null);
  assert.equal(readPromptSuggestion({ type: 'prompt_suggestion', suggestion: 'x'.repeat(501) }), null);
  assert.equal(readPromptSuggestion({ type: 'result', suggestion: 'run the tests' }), null);
});
