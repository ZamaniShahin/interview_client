// The screenshot region selector's page (3.6, v1's selector.js). Its window never takes focus (the call app keeps
// it), and Windows swallows the mouse-down of a window that can't take focus: so a drag is told from the first move
// with the left button held, anchored where the pointer last hovered. The area goes out as fractions of the window,
// which is the display, so zoom and scaling don't matter. Main checks everything it gets. For a moment after it shows,
// no press or release counts (drag.ts, `settleMs`): one meant for the overlay must never take the whole screen.
import '../shared/styles/tokens.css';
import '../shared/styles/base.css';
import './selector.css';
import { dragArea, pressCounts, type Point } from './drag';

const frame = document.getElementById('frame') as HTMLImageElement;
const shade = document.getElementById('shade') as HTMLDivElement;
const box = document.getElementById('box') as HTMLDivElement;

/** Where the pointer last was with no button held. */
let hover: Point | null = null;
/** Where the drag started, and where it is now. */
let anchor: Point | null = null;
let current: Point | null = null;
let sent = false;
/** When the window showed (`performance.now()`), or null before it did. */
let shownAt: number | null = null;
/** A press that began before the selector settled: its release chooses nothing. */
let early = false;

const point = (e: MouseEvent): Point => ({ x: e.clientX, y: e.clientY });
const counts = () => pressCounts(performance.now(), shownAt);

function send(selection: Parameters<typeof window.selectorApi.done>[0]): void {
  if (sent) return;
  sent = true;
  window.selectorApi.done(selection);
}

function draw(from: Point, to: Point): void {
  box.style.left = `${Math.min(from.x, to.x)}px`;
  box.style.top = `${Math.min(from.y, to.y)}px`;
  box.style.width = `${Math.abs(to.x - from.x)}px`;
  box.style.height = `${Math.abs(to.y - from.y)}px`;
  box.classList.remove('hidden');
  shade.classList.add('hidden');
}

/** A press that chose nothing, forgotten. */
function forget(): void {
  early = false;
  anchor = null;
  current = null;
}

/** The end of a press: a real drag sends its area, anything else the whole display. */
function finishPress(): void {
  send(dragArea(anchor, current, { width: window.innerWidth, height: window.innerHeight }) ?? { kind: 'full' });
}

// May never come on Windows (see the top); used when it does. A press from before the selector settled is marked, so
// its release never reads as a click on the whole screen.
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || sent) return;
  if (!counts()) {
    early = true;
    return;
  }
  anchor = point(e);
  current = anchor;
});

document.addEventListener('mousemove', (e) => {
  if (sent) return;
  if (e.buttons & 1) {
    if (!counts()) return;
    anchor ??= hover ?? point(e);
    current = point(e);
    if (dragArea(anchor, current, { width: window.innerWidth, height: window.innerHeight })) {
      // Held and dragged: whenever it started, it is a drag the user means.
      early = false;
      draw(anchor, current);
    }
  } else if (anchor) {
    // The button came up where the page didn't see it (outside the window, a lost mouse-up): the drag ends here.
    if (early) forget();
    else finishPress();
  } else {
    hover = point(e);
  }
});

document.addEventListener('mouseup', (e) => {
  if (sent) return;
  if (!counts()) {
    early = false;
    return;
  }
  if (e.button === 2) return send({ kind: 'cancel' });
  if (e.button !== 0) return;
  // The release of a press from before the selector settled: nothing was chosen.
  if (early) return forget();
  if (anchor) current = point(e);
  // No drag at all is a click: the whole display.
  finishPress();
});

// No native menu: a right-click cancels.
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (counts()) send({ kind: 'cancel' });
});

// Paint the frozen picture first, then ask main to show the window, so the live screen turns into its copy seamlessly.
window.selectorApi
  .init()
  .then(async (picture) => {
    if (!picture) return send({ kind: 'cancel' });
    frame.src = picture.image;
    await frame.decode();
    window.selectorApi.ready();
    shownAt = performance.now();
  })
  .catch(() => send({ kind: 'cancel' }));
