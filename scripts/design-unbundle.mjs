// Unpacks a Claude Design "bundled" HTML export into a new, empty directory so its sources can be read
// (docs/design.md: the practice screens are in such an export). It only decodes data (base64, gzip); it runs nothing
// from the bundle. Then scripts/design-split.mjs splits a page into readable parts.
// Usage: node scripts/design-unbundle.mjs <bundle.html> <outdir>
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const [, , src, out] = process.argv;
if (!src || !out) {
  console.error('usage: node scripts/design-unbundle.mjs <bundle.html> <outdir>');
  process.exit(2);
}
if (existsSync(out) && readdirSync(out).length) {
  console.error('outdir must be new or empty');
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const html = readFileSync(src, 'utf8');

function block(type) {
  const open = `<script type="${type}">`;
  const i = html.indexOf(open);
  if (i < 0) return null;
  const j = html.indexOf('</script>', i + open.length);
  return html.slice(i + open.length, j).trim();
}

const known = {
  'text/html': 'html',
  'text/css': 'css',
  'application/javascript': 'js',
  'text/javascript': 'js',
  'text/jsx': 'jsx',
  'text/babel': 'jsx',
  'application/json': 'json',
  'image/svg+xml': 'svg',
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'ttf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'text/plain': 'txt',
  'text/markdown': 'md',
};
const ext = (mime) => known[mime] ?? (mime.split('/')[1] ?? 'bin').replace(/[^a-z0-9]+/gi, '_');

const manifest = JSON.parse(block('__bundler/manifest'));
const rows = [];
for (const [id, entry] of Object.entries(manifest)) {
  let buf = Buffer.from(entry.data, 'base64');
  if (entry.compressed) buf = gunzipSync(buf);
  const name = `${id}.${ext(entry.mime)}`;
  writeFileSync(join(out, name), buf);
  const extra = Object.keys(entry).filter((k) => !['mime', 'compressed', 'data'].includes(k));
  rows.push(`${name}\t${entry.mime}\t${buf.length}${extra.length ? '\t' + extra.join(',') : ''}`);
}
writeFileSync(join(out, '_index.tsv'), rows.join('\n') + '\n');

for (const [type, file] of [
  ['__bundler/template', '_template.html'],
  ['__bundler/page_order', '_page_order.json'],
  ['__bundler/ext_resources', '_ext_resources.json'],
]) {
  const raw = block(type);
  if (raw == null) continue;
  const value = JSON.parse(raw);
  writeFileSync(join(out, file), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

console.log(rows.join('\n'));
