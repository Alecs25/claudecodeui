import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  buildWidgetDocument,
  isSafeWidgetLink,
  isShowWidgetTool,
  parseWidgetBridgeMessage,
  readWidgetInput,
  WIDGET_MESSAGE_SOURCE,
} from '@/modules/chat/utils/inlineWidget';
import { groupConsecutiveTools, isToolGroupItem } from '@/modules/chat/utils/toolGrouping';
import type { ChatMessage } from '@/shared/types';

test('show_widget is recognised under any MCP namespace', () => {
  assert.equal(isShowWidgetTool('mcp__cloudcli-visualize__show_widget'), true);
  assert.equal(isShowWidgetTool('mcp__cloudcli-visualize__read_me'), false);
});

test('a widget can only open http(s) links', () => {
  assert.equal(isSafeWidgetLink('https://histonium.tech'), true);
  assert.equal(isSafeWidgetLink('javascript:alert(1)'), false);
  assert.equal(isSafeWidgetLink('data:text/html,<script>1</script>'), false);
  assert.equal(isSafeWidgetLink('not a url'), false);
});

test('only well-formed bridge messages are accepted', () => {
  assert.deepEqual(
    parseWidgetBridgeMessage({ source: WIDGET_MESSAGE_SOURCE, type: 'send-prompt', text: 'hi' }),
    { source: WIDGET_MESSAGE_SOURCE, type: 'send-prompt', text: 'hi' },
  );
  assert.equal(parseWidgetBridgeMessage({ type: 'send-prompt', text: 'hi' }), null);
  assert.equal(parseWidgetBridgeMessage({ source: WIDGET_MESSAGE_SOURCE, type: 'resize', height: Number.NaN }), null);
  assert.equal(parseWidgetBridgeMessage('send-prompt'), null);
});

test('the widget input is read from an object or its JSON string', () => {
  const input = { title: 'demo', widget_code: '<div>x</div>' };
  assert.deepEqual(readWidgetInput(input), { code: '<div>x</div>', title: 'demo' });
  assert.deepEqual(readWidgetInput(JSON.stringify(input)), { code: '<div>x</div>', title: 'demo' });
  assert.deepEqual(readWidgetInput('{partial'), { code: '', title: '' });
});

test('the widget document locks network access down and carries the theme', () => {
  const html = buildWidgetDocument('<div id="w"></div>', true);
  assert.match(html, /default-src 'none'/);
  assert.doesNotMatch(html, /connect-src/);
  assert.match(html, /data-theme="dark"/);
  assert.match(html, /<div id="w"><\/div>/);
});

test('a widget stays visible instead of folding into the tool summary', () => {
  const tool = (toolName: string): ChatMessage => ({
    type: 'tool',
    content: '',
    timestamp: '2024-01-01T00:00:00.000Z',
    isToolUse: true,
    toolName,
    toolInput: '{}',
  });
  const items = groupConsecutiveTools([
    tool('mcp__cloudcli-visualize__read_me'),
    tool('mcp__cloudcli-visualize__show_widget'),
  ]);
  assert.deepEqual(items.map(isToolGroupItem), [true, false]);
});
