// The app's icons: 16 × 16 strokes, drawn inline from these paths. Nothing is loaded from a file or the network.
// Dots are zero-length lines with round caps. Every icon comes with a word, or is obvious alone (pause, close):
// there are no tooltips.
export const icons = {
  drag: 'M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01',
  more: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
  grip: 'M13 6.5l-6.5 6.5M13 10.5l-2.5 2.5',
  compact: 'M6 2.5V6H2.5M10 2.5V6h3.5M6 13.5V10H2.5M10 13.5V10h3.5',
  expand: 'M2.5 6V2.5H6M13.5 6V2.5H10M2.5 10v3.5H6M13.5 10v3.5H10',
  pause: 'M6 3.5v9M10 3.5v9',
  play: 'M5 3.5l7 4.5-7 4.5z',
  enter: 'M13 3.5v4a2 2 0 0 1-2 2H3.5M6 7l-2.5 2.5L6 12',
  // The canvas's: a square in front of another (code blocks' Copy).
  copy:
    'M7 5.5h5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 12V7A1.5 1.5 0 0 1 7 5.5zM10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2',
  spoken: 'M2 8h.5M4.5 5.5v5M7 3v10M9.5 5v6M12 7v2M14 8h.5',
  typed:
    'M3 4h10a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 13 12H3a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 3 4zM4.5 7h.01M7 7h.01M9.5 7h.01M12 7h.01M5.5 9.5h5',
  tip: 'M10.5 3l2.5 2.5L6 12.5 3 13l.5-3z',
  study: 'M2.5 3.5h4A1.5 1.5 0 0 1 8 5v8a1.5 1.5 0 0 0-1.5-1.5h-4zM13.5 3.5h-4A1.5 1.5 0 0 0 8 5v8a1.5 1.5 0 0 1 1.5-1.5h4z',
  result:
    'M3.5 3h9A1.5 1.5 0 0 1 14 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7A1.5 1.5 0 0 1 3.5 3zM5 6.5l2 1.5-2 1.5M8.5 10h2.5',
  screen: 'M2.5 5.5v-2h2M11.5 3.5h2v2M13.5 10.5v2h-2M4.5 12.5h-2v-2',
  chevronLeft: 'M10 3.5L5.5 8l4.5 4.5',
  chevronRight: 'M6 3.5L10.5 8 6 12.5',
  arrowDown: 'M8 3v9M4 8.5l4 4 4-4',
  close: 'M4 4l8 8M12 4l-8 8',
  plus: 'M8 3.5v9M3.5 8h9',
  minimize: 'M3.5 8h9',
  maximize: 'M4.5 3.5h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z',
  info: 'M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0zM8 7.5V11M8 5h.01',
  attention: 'M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0zM8 4.8v3.6M8 11h.01',
  done: 'M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0zM5.5 8.2l1.8 1.8 3.2-3.6',
  notDone: 'M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0z',
  check: 'M3.5 8.5l3 3 6-7',
  clock: 'M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0zM8 5v3l2 1.5',
  bolt: 'M9 2L4 9h4l-1 5 5-7H8l1-5z',
  reconnect: 'M13 8a5 5 0 1 1-1.5-3.6M13 3v3h-3',
  listeningDown: 'M3 10v2M6 7v5M9 4v8M12 8v4M2 2l12 12',
  offline:
    'M2 2l12 12M8 12.5h.01M5.8 10.2a3.2 3.2 0 0 1 4.4 0M3.6 8a6.2 6.2 0 0 1 2.6-1.6M9.9 6.4A6.2 6.2 0 0 1 12.4 8M1.5 5.6a9.3 9.3 0 0 1 2.4-1.7M7 3.3a9.3 9.3 0 0 1 7.5 2.3',
  stop: 'M5.5 4h5A1.5 1.5 0 0 1 12 5.5v5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 4 10.5v-5A1.5 1.5 0 0 1 5.5 4z',
  hidden:
    'M2 2l12 12M6.6 6.6a2 2 0 0 0 2.8 2.8M4.2 4.4C2.9 5.3 2 6.6 1.5 8c1.1 2.9 3.7 4.5 6.5 4.5 1.3 0 2.6-.3 3.6-1M7 3.6c.3 0 .7-.1 1-.1 2.8 0 5.4 1.6 6.5 4.5-.3.8-.7 1.5-1.2 2.2',
  external: 'M9 2.5h4.5V7M13.5 2.5L7.5 8.5M11.5 9.5v3.5h-9v-9H6',
  computer: 'M4 3.5h8a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1zM1.5 12.5h13',
  shield: 'M8 2l5 2v4c0 3-2.2 5.2-5 6-2.8-.8-5-3-5-6V4z',
  // The first-run notice's rows (F1 · 1): a server, and a cloud for the AI provider, with no one's logo.
  server: 'M3 3h10v4H3zM3 9h10v4H3zM5.5 5h.01M5.5 11h.01',
  cloud: 'M4.5 12.5h7.2a2.8 2.8 0 0 0 .3-5.6A4.2 4.2 0 0 0 4 7.6a2.5 2.5 0 0 0 .5 4.9z',
  pin: 'M9.5 2.5l4 4-1.8.9-2.6 2.6.4 2.6-1 1-6-6 1-1 2.6.4 2.6-2.6zM5.5 10.5l-3 3',
  home: 'M2.5 7.5L8 3l5.5 4.5V13H10V9.5H6V13H2.5z',
  prepare: 'M4 2.5h5l3 3v8H4zM9 2.5v3h3',
  practice: 'M13.5 8a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0zM10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  history: 'M3 8a5 5 0 1 0 1.5-3.6M3 3v2.5h2.5M8 5.5V8l2 1.2',
  account: 'M10.5 5.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM3 13.5c.8-2.3 2.7-3.5 5-3.5s4.2 1.2 5 3.5',
  settings:
    'M10 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2',
  help: 'M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0zM6.3 6.2a1.8 1.8 0 0 1 3.4.8c0 1.2-1.7 1.5-1.7 2.5M8 11.2h.01',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5',
} as const;

export type IconName = keyof typeof icons;
