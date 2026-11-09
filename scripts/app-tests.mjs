// The built app's own windows under Playwright, against the preview (tests/app, 1.13): builds the preview into out/,
// then runs those tests with SOTTO_APP=1. Windows only, since they read the windows' display affinity.
//
//   node scripts/app-tests.mjs
//
// out/ then holds a preview build: `npm run build` (and `npm run dist:win`, which builds first) makes a normal one.
// Started from VS Code, Electron would inherit ELECTRON_RUN_AS_NODE and run as plain Node: it is removed here.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const env = { ...process.env, SOTTO_APP: '1' };
delete env.ELECTRON_RUN_AS_NODE;

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('node_modules/electron-vite/bin/electron-vite.js', ['build', '--mode', 'preview']);
// One file at a time: the app holds a single-instance lock, so a second one launched alongside would quit.
run('node_modules/vitest/vitest.mjs', ['run', 'tests/app', '--no-file-parallelism']);
