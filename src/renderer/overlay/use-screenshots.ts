// The images of the screenshots the overlay shows (3.6). Main keeps the screenshots; the overlay asks for one by its
// id the first time it draws it, and keeps the answer while something on screen still names it.
import { reactive } from 'vue';

/** An image: its data URL, `null` once main no longer keeps it, or missing while it is asked for. */
const images = reactive(new Map<string, string | null>());
const asked = new Set<string>();

/** The image of screenshot `id`, asking main for it the first time. */
export function screenshotImage(id: string): string | null | undefined {
  if (!asked.has(id)) {
    asked.add(id);
    window.overlayApi
      .screenshot(id)
      .then((url) => images.set(id, url))
      .catch(() => images.set(id, null));
  }
  return images.get(id);
}

/** Lets go of every image nothing on screen names any more: a renderer holds no more than it shows. */
export function keepScreenshotImages(inUse: Iterable<string>): void {
  const keep = new Set(inUse);
  for (const id of [...asked]) {
    if (keep.has(id)) continue;
    asked.delete(id);
    images.delete(id);
  }
}
