// Checks a packaged app (4.1): the fuses flipped as electron-builder.yml asks, and the ASAR holding the built app and
// main's packages only, none of the pages' (pdf.js and its native canvas, mermaid, Vue…), which Vite bundles. Uses the
// tools electron-builder itself runs (@electron/fuses, @electron/asar); no network.
//
//   npm run build && npx electron-builder --win --dir --config electron-builder.yml
//   node scripts/package-check.mjs [dist/win-unpacked]
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses');
const { FuseState } = require('@electron/fuses/dist/constants.js');
const asar = require('@electron/asar');

const dir = resolve(process.argv[2] ?? 'dist/win-unpacked');
const exe = join(dir, 'Sotto.exe');
const archive = join(dir, 'resources', 'app.asar');
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed += 1;
};

check(existsSync(exe), `the executable: ${exe}`);
check(existsSync(archive), `the archive: ${archive}`);
if (failed) process.exit(1);

const wire = await getCurrentFuseWire(exe);
const expected = {
  RunAsNode: false,
  EnableCookieEncryption: true,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  EnableEmbeddedAsarIntegrityValidation: true,
  OnlyLoadAppFromAsar: true,
  LoadBrowserProcessSpecificV8Snapshot: false,
  GrantFileProtocolExtraPrivileges: false,
};
for (const [name, on] of Object.entries(expected)) {
  const state = wire[FuseV1Options[name]];
  check(state === (on ? FuseState.ENABLE : FuseState.DISABLE), `fuse ${name} ${on ? 'on' : 'off'}`);
}

const files = asar.listPackage(archive, { isPack: false }).map((f) => f.replaceAll('\\', '/'));
const has = (prefix) => files.some((f) => f.startsWith(prefix));
check(has('/out/main/index.js'), 'the main process');
check(has('/out/renderer/overlay/index.html') && has('/out/renderer/app/index.html'), 'the pages');
for (const needed of ['@microsoft/signalr', 'better-sqlite3-multiple-ciphers', 'zod', 'electron-updater']) {
  check(has(`/node_modules/${needed}/`), `main's package ${needed}`);
}
for (const left of [
  'pdfjs-dist',
  '@napi-rs',
  'mammoth',
  'mermaid',
  'vue',
  'pinia',
  'highlight.js',
  'dompurify',
  'markdown-it',
]) {
  check(!has(`/node_modules/${left}/`), `no ${left}: the pages bundle their own`);
}
console.log(`${files.length} entries in the archive`);
process.exit(failed ? 1 : 0);
