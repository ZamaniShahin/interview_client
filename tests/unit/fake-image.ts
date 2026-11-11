// A stand-in for Electron's NativeImage in the screenshot tests (3.6): a size, a fill (or a bitmap of its own), and
// encoded sizes by weight, so a test chooses which encoding fits.
import type { ShotImage } from '../../src/main/screenshots/shot-image';

/** Bytes per pixel a fake image encodes to: PNG's, then JPEG's at quality 100 (scaled by the quality asked). */
export interface Weights {
  png: number;
  jpeg: number;
}

/** Stands in for Electron's NativeImage: a size, a fill (or a bitmap of its own), and encoded sizes by weight. */
export class FakeImage implements ShotImage {
  readonly crops: { x: number; y: number; width: number; height: number }[] = [];
  readonly resizes: { width?: number; height?: number }[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
    readonly fill = 200,
    readonly weights: Weights = { png: 0.5, jpeg: 0.2 },
    readonly bitmap?: (w: number, h: number) => Uint8Array,
  ) {}

  getSize() {
    return { width: this.width, height: this.height };
  }

  isEmpty() {
    return this.width === 0 || this.height === 0;
  }

  resize(options: { width?: number; height?: number }): FakeImage {
    this.resizes.push(options);
    const width = options.width ?? Math.round((this.width * options.height!) / this.height);
    const height = options.height ?? Math.max(1, Math.round((this.height * options.width!) / this.width));
    return new FakeImage(width, height, this.fill, this.weights, this.bitmap);
  }

  crop(rect: { x: number; y: number; width: number; height: number }): FakeImage {
    this.crops.push(rect);
    return new FakeImage(rect.width, rect.height, this.fill, this.weights, this.bitmap);
  }

  toPNG() {
    return new Uint8Array(Math.round(this.width * this.height * this.weights.png));
  }

  toJPEG(quality: number) {
    return new Uint8Array(Math.round((this.width * this.height * this.weights.jpeg * quality) / 100));
  }

  toBitmap() {
    return this.bitmap?.(this.width, this.height) ?? new Uint8Array(this.width * this.height * 4).fill(this.fill);
  }
}
