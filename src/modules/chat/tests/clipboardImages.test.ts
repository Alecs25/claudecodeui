import assert from 'node:assert/strict';

import { afterEach, test, vi } from 'vitest';

import { readClipboardImages } from '@/modules/chat/utils/clipboardImages';

const setClipboard = (clipboard: unknown) => {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
};

afterEach(() => {
  setClipboard(undefined);
  vi.restoreAllMocks();
});

test('images on the clipboard come back as named files', async () => {
  const png = new Blob(['png-bytes'], { type: 'image/png' });
  setClipboard({
    read: async () => [
      { types: ['text/plain'], getType: async () => new Blob(['text']) },
      { types: ['image/png'], getType: async () => png },
    ],
  });

  const result = await readClipboardImages(() => 1000);
  assert.ok('files' in result);
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].name, 'appunti-1000-1.png');
  assert.equal(result.files[0].type, 'image/png');
});

test('an empty, refused or missing clipboard is reported, not thrown', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  setClipboard({ read: async () => [{ types: ['text/plain'], getType: async () => new Blob(['x']) }] });
  assert.deepEqual(await readClipboardImages(), { error: 'empty' });

  setClipboard({ read: async () => { throw new DOMException('no', 'NotAllowedError'); } });
  assert.deepEqual(await readClipboardImages(), { error: 'denied' });

  setClipboard(undefined);
  assert.deepEqual(await readClipboardImages(), { error: 'unsupported' });
});

test('an image the browser lists but cannot decode is reported, not thrown', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  setClipboard({
    read: async () => [{ types: ['image/png'], getType: async () => { throw new DOMException('bad', 'DataError'); } }],
  });
  assert.deepEqual(await readClipboardImages(), { error: 'unsupported' });
});
