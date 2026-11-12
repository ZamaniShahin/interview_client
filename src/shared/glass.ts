// What each window has behind its page (Shahin, 2026-11-12), so the user can see what is behind Sotto:
// - clear, the overlay's, as v1's was: a transparent window, so the call app behind it, its text and its code, shows
//   through as it is and can be read, while Sotto's own text stays solid. Every Windows draws it;
// - frosted, the app window's: Windows 11's acrylic behind the window, blurring what is behind it. Where Windows draws
//   no acrylic (Windows 10, Windows 11 before 22H2), the app window stays solid and its page is told nothing.
// Main tells each page by its address (`?glass=clear`, `?glass=frosted`); the page paints its background at the
// opacity chosen for its window over what it was told.

export type Glass = 'clear' | 'frosted';

/** The glass a page's address (`location.search`) names, or none: anything else is no glass at all. */
export function glassOf(search: string): Glass | null {
  const glass = new URLSearchParams(search).get('glass');
  return glass === 'clear' || glass === 'frosted' ? glass : null;
}
