// WCAG 2.x contrast ratios for the neutral placeholder palette (Sotto UI; docs/design.md, "contrast measured").
// The values are src/renderer/shared/styles/tokens.css's: keep them in step when a color changes.
// Usage: node scripts/contrast.mjs
const hex = (h) => {
  const v = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
};
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h) => {
  const [r, g, b] = hex(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const themes = {
  dark: {
    bgs: { 'surface-0': '#111113', 'surface-1': '#1A1A1D', 'surface-2': '#242428', 'surface-3': '#2F2F34' },
    fgs: {
      'text-0': '#F4F4F5',
      'text-1': '#E4E4E7',
      'text-2': '#A1A1AA',
      'text-3': '#8E8E97',
      'text-off': '#5C5C64',
      edge: '#76767F',
      key: '#FBBF24',
      ok: '#4ADE80',
      'danger-text': '#FCA5A5',
    },
  },
  light: {
    bgs: { 'surface-0': '#F1F1F3', 'surface-1': '#FFFFFF', 'surface-2': '#F7F7F8', 'surface-3': '#E6E6E9' },
    fgs: {
      'text-0': '#18181B',
      'text-1': '#27272A',
      'text-2': '#52525B',
      'text-3': '#63636B',
      'text-off': '#A1A1AA',
      edge: '#8A8A93',
      key: '#A15C07',
      ok: '#15803D',
      'danger-text': '#B91C1C',
    },
  },
};

for (const [name, t] of Object.entries(themes)) {
  console.log(`\n${name}: rows = foreground, columns = ${Object.keys(t.bgs).join(' | ')}`);
  for (const [f, fv] of Object.entries(t.fgs)) {
    const cells = Object.values(t.bgs).map((bv) => ratio(fv, bv).toFixed(2).padStart(6));
    console.log(`${f.padEnd(12)} ${fv}  ${cells.join('  ')}`);
  }
}
// Primary button: text on its fill.
console.log('\nprimary dark  #111113 on #F4F4F5:', ratio('#111113', '#F4F4F5').toFixed(2));
console.log('primary light #FFFFFF on #18181B:', ratio('#FFFFFF', '#18181B').toFixed(2));
console.log('code dark text-1 on #0C0C0E:', ratio('#E4E4E7', '#0C0C0E').toFixed(2), ' key words never in code');
console.log('code light text-1 on #F4F4F6:', ratio('#27272A', '#F4F4F6').toFixed(2));
