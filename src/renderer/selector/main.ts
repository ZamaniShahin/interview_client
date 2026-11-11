// The screenshot region selector's page (3.6, v1's selector.js). Its window never takes focus (the call app keeps
// it), and Windows swallows the mouse-down of a window that can't take focus: so a drag is told from the first move
// with the left button held, anchored where the pointer last hovered. The area goes out as fractions of the window,
// which is the display, so zoom and scaling don't matter. Main checks everything it gets.
import '../shared/styles/tokens.css';
import '../shared/styles/base.css';
import './selector.css';
import { dragArea, type Point } from './drag';

const frame = document.getElementById('frame') as HTMLImageElement;
const shade = document.getElementById('shade') as HTMLDivElement;
const box = document.getElementById('box') as HTMLDivElement;

/** Where the pointer last was with no button held. */
let hover: Point | null = null;
/** Where the drag started, and where it is now. */
let anchor: Point | null = null;
let current: Point | null = null;
let sent = false;

const point = (e: MouseEvent): Point => ({ x: e.clientX, y: e.clientY });

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

/** The end of a press: a real drag sends its area, anything else the whole display. */
function finishPress(): void {
  send(dragArea(anchor, current, { width: window.innerWidth, height: window.innerHeight }) ?? { kind: 'full' });
}

// May never come on Windows (see the top); used when it does.
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || sent) return;
  anchor = point(e);
  current = anchor;
});

document.addEventListener('mousemove', (e) => {
  if (sent) return;
  if (e.buttons & 1) {
    anchor ??= hover ?? point(e);
    current = point(e);
    if (dragArea(anchor, current, { width: window.innerWidth, height: window.innerHeight })) draw(anchor, current);
  } else if (anchor) {
    // The button came up where the page didn't see it (outside the window, a lost mouse-up): the drag ends here.
    finishPress();
  } else {
    hover = point(e);
  }
});

document.addEventListener('mouseup', (e) => {
  if (sent) return;
  if (e.button === 2) return send({ kind: 'cancel' });
  if (e.button !== 0) return;
  if (anchor) current = point(e);
  // No drag at all is a click: the whole display.
  finishPress();
});

// No native menu: a right-click cancels.
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  send({ kind: 'cancel' });
});

// Paint the frozen picture first, then ask main to show the window, so the live screen turns into its copy seamlessly.
window.selectorApi
  .init()
  .then(async (picture) => {
    if (!picture) return send({ kind: 'cancel' });
    frame.src = picture.image;
    await frame.decode();
    window.selectorApi.ready();
  })
  .catch(() => send({ kind: 'cancel' }));
