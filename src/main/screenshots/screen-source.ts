// Which of the capturer's screens is the display a screenshot is for (3.6): found in Shahin's deep round of 2026-11-14,
// where on a laptop with two graphics adapters (Intel and NVIDIA) and two screens every screenshot failed.

/** A screen as desktopCapturer offers it: its id (`screen:<n>:<m>`), its display's id ('' when it gives none), its picture. */
export interface ScreenSource {
  id: string;
  display_id: string;
  thumbnail: { getSize(): { width: number; height: number } };
}

/** A pixel or two of rounding between the display's size and its screen's picture. */
const sizeSlack = 2;

/** The `n` of a screen's id (`screen:<n>:<m>`): its place in the capturer's list; none for another kind of id. */
function screenIndex(source: ScreenSource): number | null {
  const match = /^screen:(\d+):/.exec(source.id);
  return match ? Number(match[1]) : null;
}

/**
 * The capturer's screen for `display`, or null when it can't be told:
 * - by its display id, when the capturer gives one;
 * - the only screen, when there is one;
 * - when the capturer gives no display id at all (its GDI path: a laptop whose screens hang off two graphics adapters
 *   gets no DirectX duplication), by order. It lists the screens in the system's display order, which is the order
 *   Electron lists `displays` in, so the display's place among them is its screen's. That rests on the two orders
 *   agreeing, as they do on the laptop it was found on; so it is taken only when every screen has an index, the counts
 *   agree, and the picture fits `size` (the display's, in pixels). The capturer scales each screen into that size, so
 *   this catches a screen of another shape, not one of the same shape at another resolution.
 */
export function pickScreenSource<S extends ScreenSource>(
  sources: readonly S[],
  display: { id: number },
  displays: readonly { id: number }[],
  size: { width: number; height: number },
): S | null {
  const byId = sources.find((s) => s.display_id !== '' && Number(s.display_id) === display.id);
  if (byId) return byId;
  if (sources.length === 1) return sources[0]!;

  if (sources.length === 0 || sources.some((s) => s.display_id !== '')) return null;
  if (sources.length !== displays.length) return null;
  const indexed = sources.map((s) => ({ source: s, index: screenIndex(s) }));
  if (indexed.some((s) => s.index === null)) return null;
  if (new Set(indexed.map((s) => s.index)).size !== indexed.length) return null;

  const place = displays.findIndex((d) => d.id === display.id);
  if (place < 0) return null;
  const ordered = indexed.sort((a, b) => a.index! - b.index!).map((s) => s.source);
  const candidate = ordered[place]!;
  const picture = candidate.thumbnail.getSize();
  const fits = Math.abs(picture.width - size.width) <= sizeSlack && Math.abs(picture.height - size.height) <= sizeSlack;
  return fits ? candidate : null;
}
