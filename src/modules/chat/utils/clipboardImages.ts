export type ClipboardImageResult =
  | { files: File[] }
  | { error: 'unsupported' | 'denied' | 'empty' };

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/** True where the page can read images from the system clipboard on request. */
export const canReadClipboardImages = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function';

/**
 * Reads the images on the system clipboard.
 *
 * Android keyboards (Samsung, Gboard) offer their clipboard images only to
 * rich editors, never to a <textarea>, so a screenshot copied on the phone
 * never reaches the composer's paste event; the async Clipboard API reads it
 * directly, after a one-time permission prompt.
 */
export async function readClipboardImages(now: () => number = Date.now): Promise<ClipboardImageResult> {
  if (!canReadClipboardImages()) {
    return { error: 'unsupported' };
  }

  let items: ClipboardItems;
  try {
    items = await navigator.clipboard.read();
  } catch (error) {
    // NotAllowedError when the user refuses or the page is not focused; anything
    // else means the browser could not hand the clipboard over.
    return { error: (error as DOMException)?.name === 'NotAllowedError' ? 'denied' : 'unsupported' };
  }

  const files: File[] = [];
  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith('image/'));
    if (!imageType) {
      continue;
    }
    const blob = await item.getType(imageType);
    const extension = EXTENSION_BY_TYPE[imageType] ?? 'png';
    files.push(new File([blob], `appunti-${now()}-${files.length + 1}.${extension}`, { type: imageType }));
  }

  return files.length > 0 ? { files } : { error: 'empty' };
}
