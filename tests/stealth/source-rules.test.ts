// The stealth rules that can be checked by reading the source (README, "Stealth rules"). The ones that need a running
// window (display affinity after hide and show, focus) come with the overlay checkpoint, in Playwright (1.13).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));

function files(dir: string, extensions: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, extensions);
    return extensions.some((ext) => name.endsWith(ext)) ? [path] : [];
  });
}

const renderer = files(join(root, 'src', 'renderer'), ['.vue', '.ts', '.css', '.html']);
const main = files(join(root, 'src', 'main'), ['.ts']);
const show = (paths: string[]) => paths.map((p) => relative(root, p));

describe('stealth rules in the source', () => {
  it('has no title attribute in any template or page (rule 2: a tooltip is a window a share can see)', () => {
    const offenders = renderer.filter((f) => /\s(?:v-bind)?:?title=/.test(readFileSync(f, 'utf8')));
    expect(show(offenders)).toEqual([]);
  });

  it('has no native select (rule 3: its list is a separate window)', () => {
    const offenders = renderer.filter((f) => /<select[\s>]/i.test(readFileSync(f, 'utf8')));
    expect(show(offenders)).toEqual([]);
  });

  it('has exactly one cursor rule, the global arrow in base.css (rule 4)', () => {
    const withCursor = renderer.filter((f) => /cursor\s*:/.test(readFileSync(f, 'utf8')));
    expect(show(withCursor)).toEqual([join('src', 'renderer', 'shared', 'styles', 'base.css')]);
    expect(readFileSync(withCursor[0]!, 'utf8')).toMatch(/\*\s*\{\s*cursor:\s*default\s*!important;\s*\}/);
  });

  it('keeps every window it creates out of captures (rule 1)', () => {
    const creators = main.filter((f) => readFileSync(f, 'utf8').includes('new BrowserWindow('));
    expect(creators.length).toBeGreaterThan(0);
    for (const file of creators) expect(readFileSync(file, 'utf8'), relative(root, file)).toContain('keepOutOfCapture(');
  });

  it('gives the overlay no OS resize border (rule 5) and no focus when shown (rule 6)', () => {
    const overlay = readFileSync(join(root, 'src', 'main', 'windows', 'overlay-window.ts'), 'utf8');
    expect(overlay).toContain('resizable: false');
    expect(overlay).toContain('frame: false');
    expect(readFileSync(join(root, 'src', 'main', 'index.ts'), 'utf8')).toContain('showInactive()');
  });

  it('gives a session no taskbar button, which a full-screen share would show (Q16)', () => {
    const overlay = readFileSync(join(root, 'src', 'main', 'windows', 'overlay-window.ts'), 'utf8');
    expect(overlay).toContain('skipTaskbar: true');
    expect(readFileSync(join(root, 'src', 'shared', 'settings.ts'), 'utf8')).not.toMatch(/trayOnly|skipTaskbar/);
  });
});

describe('safety rules in the source', () => {
  it("renders HTML from a string only in the answer's components, each saying why (CLAUDE.md rule 7)", () => {
    const withHtml = renderer.filter((f) => /\sv-html=/.test(readFileSync(f, 'utf8')));
    const answerComponents = ['AnswerBody.vue', 'AnswerCode.vue', 'AnswerDiagram.vue'].map((name) =>
      join('src', 'renderer', 'overlay', 'components', name),
    );
    expect(show(withHtml).sort()).toEqual(answerComponents.sort());
    for (const file of withHtml) {
      const uses = readFileSync(file, 'utf8').split('\n').filter((line) => /\sv-html=/.test(line)).length;
      const reasons = (readFileSync(file, 'utf8').match(/eslint-disable-next-line vue\/no-v-html -- \S/g) ?? []).length;
      expect(reasons, relative(root, file)).toBe(uses);
    }
  });
});
