// Checks this computer's audio capture (1.11) for real, with nothing shown: the built app runs with
// `--capture-check`, opens only its hidden capture window, and prints what arrived in six seconds, as one JSON line.
//
//   npm run build && node scripts/capture-check.mjs
//
// Frames come about ten a second, 4,800 bytes each, even in silence; `loudest` stays at 0 unless something plays.
// Nothing is uploaded, kept or played. Exit code 0 when frames came.
//
// Electron is started without ELECTRON_RUN_AS_NODE, which tools hosted in VS Code inherit (CLAUDE.md).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const root = fileURLToPath(new URL('..', import.meta.url));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const run = spawnSync(electron, ['.', '--capture-check'], { cwd: root, env, stdio: 'inherit' });
process.exit(run.status ?? 1);
