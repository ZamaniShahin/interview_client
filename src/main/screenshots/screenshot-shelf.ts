// The session's screenshots, kept in main's memory only (3.6): the overlay shows them, and a session that moves to
// another server gets them attached again (the server keeps no image). None is written to disk, and all go when the
// session's overlay is closed.
import type { EncodedShot } from './shot-image';

export interface KeptShot extends EncodedShot {
  id: string;
}

/**
 * How many are kept at most, besides those still in use: the oldest others go first. Each is 1.5 MB at most, so the
 * shelf stays within some 60 MB however long the interview.
 */
export const shelfLimit = 40;

export class ScreenshotShelf {
  private readonly shots = new Map<string, KeptShot>();
  private seq = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly limit = shelfLimit,
  ) {}

  get size(): number {
    return this.shots.size;
  }

  /** Keeps a new screenshot under a new id: unique in this app's life, at most 40 characters as the server takes. */
  keep(shot: EncodedShot): string {
    this.seq += 1;
    const id = `shot-${this.now().toString(36)}-${this.seq}`;
    this.shots.set(id, { ...shot, id });
    return id;
  }

  get(id: string): KeptShot | null {
    return this.shots.get(id) ?? null;
  }

  /** The image as the overlay draws it. */
  dataUrl(id: string): string | null {
    const shot = this.shots.get(id);
    return shot ? `data:${shot.mime};base64,${Buffer.from(shot.bytes).toString('base64')}` : null;
  }

  /** Lets one go: a capture the server refused. */
  drop(id: string): void {
    this.shots.delete(id);
  }

  /** Over the limit, lets the oldest go that nothing shows or waits on any more. */
  prune(inUse: Iterable<string>): void {
    if (this.shots.size <= this.limit) return;
    const used = new Set(inUse);
    // A Map keeps the order things were put in: the oldest first.
    for (const id of this.shots.keys()) {
      if (this.shots.size <= this.limit) return;
      if (!used.has(id)) this.shots.delete(id);
    }
  }

  clear(): void {
    this.shots.clear();
  }
}
