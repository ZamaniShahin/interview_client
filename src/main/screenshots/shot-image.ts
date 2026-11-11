// The picture side of a screenshot (3.6, ported from v1's ui/main.js): tell a blank capture, cut out the chosen area,
// and encode it within the server's limits. Pure over `ShotImage`, the part of Electron's NativeImage it needs, so the
// tests run it without Electron.
import type { Area } from '../../shared/screenshots';

/** What these functions need of an image: Electron's NativeImage has all of it. */
export interface ShotImage {
  getSize(): { width: number; height: number };
  isEmpty(): boolean;
  resize(options: { width?: number; height?: number; quality?: 'good' | 'better' | 'best' }): ShotImage;
  crop(rect: { x: number; y: number; width: number; height: number }): ShotImage;
  toPNG(): Uint8Array;
  toJPEG(quality: number): Uint8Array;
  /** Raw pixels, four bytes each (BGRA). */
  toBitmap(): Uint8Array;
}

/** The long edge a screenshot keeps: the server takes no more (2,048 px), and vision models scale down past it. */
export const maxShotEdge = 2048;

/** At most 1.5 MB, well inside the server's 2 MB, as v1 kept it. */
export const maxShotBytes = 1.5 * 1024 * 1024;

/** An area narrower or lower than this was a slip of the mouse: the whole display is taken instead (v1). */
export const minAreaPx = 16;

/** The JPEG qualities tried, best first, once a PNG is too large (v1's). */
const jpegQualities = [85, 75, 65, 60];

export interface EncodedShot {
  bytes: Uint8Array;
  mime: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
}

/**
 * A lock screen, a system prompt or protected video captures as black, or nearly: sending it would only get a confused
 * answer. Read at 16 pixels wide, every pixel darker than 8 in each channel.
 */
export function isBlank(image: ShotImage): boolean {
  const pixels = image.resize({ width: 16 }).toBitmap();
  for (let i = 0; i + 2 < pixels.length; i += 4) {
    if (pixels[i]! >= 8 || pixels[i + 1]! >= 8 || pixels[i + 2]! >= 8) return false;
  }
  return true;
}

/** The chosen area cut out of the display's picture, in its pixels; a sliver of one keeps the whole display. */
export function cutOut(image: ShotImage, area: Area): ShotImage {
  const { width, height } = image.getSize();
  const x = Math.min(width - 1, Math.round(area.x * width));
  const y = Math.min(height - 1, Math.round(area.y * height));
  const w = Math.min(width - x, Math.round(area.w * width));
  const h = Math.min(height - y, Math.round(area.h * height));
  if (w < minAreaPx || h < minAreaPx) return image;
  return image.crop({ x, y, width: w, height: h });
}

/**
 * Encoded for the model: the long edge capped, PNG first (the crispest text), then JPEG at falling quality, then once
 * more three quarters the size. Null if nothing fits, which no real screen reaches.
 */
export function encodeShot(image: ShotImage): EncodedShot | null {
  let im = image;
  const { width, height } = im.getSize();
  if (width < 1 || height < 1) return null;
  const scale = maxShotEdge / Math.max(width, height);
  if (scale < 1) {
    im = im.resize({
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
      quality: 'better',
    });
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const png = im.toPNG();
    if (png.length <= maxShotBytes) return packed(im, png, 'image/png');
    for (const quality of jpegQualities) {
      const jpeg = im.toJPEG(quality);
      if (jpeg.length <= maxShotBytes) return packed(im, jpeg, 'image/jpeg');
    }
    const size = im.getSize();
    im = im.resize({
      width: Math.max(1, Math.round(size.width * 0.75)),
      height: Math.max(1, Math.round(size.height * 0.75)),
      quality: 'better',
    });
  }
  return null;
}

function packed(image: ShotImage, bytes: Uint8Array, mime: EncodedShot['mime']): EncodedShot {
  const { width, height } = image.getSize();
  return { bytes: Uint8Array.from(bytes), mime, width, height };
}
