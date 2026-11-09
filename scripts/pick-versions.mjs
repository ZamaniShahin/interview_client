// For each npm package, picks the highest stable version published at least MIN_AGE_DAYS ago (so a fresh release,
// or a backport published after a newer major, never wins by date), and prints its peer dependencies. It applies the
// two-week rule for packages (CLAUDE.md, "Packages").
// Usage: node scripts/pick-versions.mjs <pkg>[@<major>] ...
import { execFileSync } from 'node:child_process';

const MIN_AGE_DAYS = 14;
const now = Date.now();
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (args) =>
  execFileSync(npm, args, { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 256 * 1024 * 1024 });
const cmp = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
};

for (const spec of process.argv.slice(2)) {
  const at = spec.lastIndexOf('@');
  const [pkg, major] = at > 0 ? [spec.slice(0, at), spec.slice(at + 1)] : [spec, null];
  try {
    const time = JSON.parse(run(['view', pkg, 'time', '--json']));
    const stable = Object.entries(time)
      .filter(([v]) => /^\d+\.\d+\.\d+$/.test(v))
      .filter(([v]) => !major || v.split('.')[0] === major)
      .map(([v, t]) => ({ v, t: Date.parse(t) }));
    const old = stable.filter(({ t }) => now - t >= MIN_AGE_DAYS * 86400000).sort((a, b) => cmp(b.v, a.v));
    const highest = [...stable].sort((a, b) => cmp(b.v, a.v))[0];
    const pick = old[0];
    let peers = '';
    if (pick) {
      const out = run(['view', `${pkg}@${pick.v}`, 'peerDependencies', '--json']).trim();
      peers = out ? JSON.stringify(JSON.parse(out)) : '';
    }
    console.log(
      `${pkg}\t${pick ? pick.v : '-'}\t${pick ? new Date(pick.t).toISOString().slice(0, 10) : ''}\thighest ${highest ? highest.v : '-'}\tpeers ${peers}`,
    );
  } catch (e) {
    console.log(`${pkg}\tERROR ${String(e.message).split('\n')[0]}`);
  }
}
