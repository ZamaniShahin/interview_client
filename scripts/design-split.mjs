// Splits one unpacked design page (_template.html, from scripts/design-unbundle.mjs) into its parts, for reading:
// tokens.css (design-system vars), fonts.css (@font-face), page.css (the page's own styles),
// body.html (the markup), logic.js (the text/x-dc script), and text.txt (visible text as an outline).
// Usage: node scripts/design-split.mjs <page-dir>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const html = readFileSync(join(dir, '_template.html'), 'utf8');

const styles = [...html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)];
const tokens = styles
  .filter((m) => m[1].includes('data-dc-design-system-vars'))
  .map((m) => m[2])
  .join('\n');
const fonts = styles
  .filter((m) => m[2].includes('@font-face'))
  .map((m) => m[2])
  .join('\n');
const page = styles
  .filter((m) => !m[1].includes('data-dc-design-system-vars') && !m[2].includes('@font-face'))
  .map((m) => m[2])
  .join('\n/* ---- */\n');
const logic = [...html.matchAll(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');

let body = html.slice(html.indexOf('<body'));
body = body
  .replace(/<helmet>[\s\S]*?<\/helmet>/g, '')
  .replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/<script[\s\S]*?<\/script>/g, '');

// A light outline of the visible text: block-level tags start a new line; a few attributes that carry
// meaning for this review (aria-label, title, alt, placeholder, role) are kept inline in [brackets].
const block =
  /^(div|section|header|footer|main|aside|nav|h[1-6]|p|li|ul|ol|table|tr|td|th|figure|figcaption|article|label|button|pre|blockquote|br|hr|form|fieldset|details|summary|dl|dt|dd)$/i;
let text = '';
for (const m of body.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g)) {
  if (m[4] !== undefined) {
    text += m[4];
    continue;
  }
  const [, close, tag, attrs] = m;
  if (block.test(tag)) text += '\n';
  if (!close) {
    const keep = [...attrs.matchAll(/\b(aria-label|title|alt|placeholder|role)="([^"]*)"/g)].map(
      (a) => `${a[1]}=${a[2]}`,
    );
    if (keep.length) text += ` [${keep.join(' ')}] `;
  }
}
const decode = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
text = decode(text)
  .split('\n')
  .map((l) => l.replace(/\s+/g, ' ').trim())
  .filter(Boolean)
  .join('\n');

for (const [name, value] of Object.entries({
  'tokens.css': tokens,
  'fonts.css': fonts,
  'page.css': page,
  'body.html': body,
  'logic.js': logic,
  'text.txt': text,
})) {
  writeFileSync(join(dir, name), value);
}
console.log(
  `${dir}: tokens=${tokens.length} fonts=${fonts.length} page.css=${page.length} body=${body.length} logic=${logic.length} text=${text.length}`,
);
