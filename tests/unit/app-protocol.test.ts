// The built pages served from app://sotto/ (4.1): an address names a file inside the built renderer, or nothing.
import { join, normalize } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ net: {}, protocol: {} }));
const { appUrl, fileOf } = await import('../../src/main/windows/app-protocol');

const root = normalize('C:/Program Files/Sotto/resources/app.asar/out/renderer');

describe('a page’s address (4.1)', () => {
  it.each<[string, string | undefined, string | undefined, string]>([
    ['overlay', undefined, undefined, 'app://sotto/overlay/index.html'],
    ['app', undefined, undefined, 'app://sotto/app/index.html'],
    ['overlay', 'hiding-test', undefined, 'app://sotto/overlay/index.html#hiding-test'],
    // What the page is told goes before its mode, as an address has them (the glass, 2026-11-12).
    ['app', undefined, '?glass=frosted', 'app://sotto/app/index.html?glass=frosted'],
    ['overlay', 'hiding-test', '?glass=clear', 'app://sotto/overlay/index.html?glass=clear#hiding-test'],
    ['overlay', undefined, '', 'app://sotto/overlay/index.html'],
  ])('names %s (%s, %s) as %s', (page, hash, search, url) => {
    expect(appUrl(page, hash, search)).toBe(url);
  });

  it('serves the page it names, whatever it is told', () => {
    for (const url of [
      'app://sotto/app/index.html?glass=frosted',
      'app://sotto/overlay/index.html?glass=clear#hiding-test',
    ]) {
      expect(fileOf(url, root)).toBe(join(root, new URL(url).pathname.slice(1)));
    }
  });
});

describe('the file an app:// address names (4.1)', () => {
  it.each<[string, string]>([
    ['app://sotto/overlay/index.html', 'overlay/index.html'],
    ['app://sotto/assets/index-abc123.js', 'assets/index-abc123.js'],
    ['app://sotto/assets/a%20b.css', 'assets/a b.css'],
    ['app://sotto/overlay/index.html#hiding-test', 'overlay/index.html'],
    ['app://sotto/overlay/index.html?x=1', 'overlay/index.html'],
    ['app://SOTTO/app/index.html', 'app/index.html'],
  ])('serves %s from the built pages', (url, file) => {
    expect(fileOf(url, root)).toBe(join(root, file));
  });

  it.each([
    ['another host', 'app://evil/overlay/index.html'],
    ['another scheme', 'file:///C:/Windows/win.ini'],
    ['https', 'https://sotto/overlay/index.html'],
    ['an encoded backslash', 'app://sotto/..%5C..%5Csecrets.txt'],
    ['a nul', 'app://sotto/overlay/index.html%00.png'],
    ['a malformed escape', 'app://sotto/%E0%A4%A'],
    ['the root itself', 'app://sotto/'],
    ['credentials', 'app://user:pass@sotto/overlay/index.html'],
    ['nothing', ''],
    ['not an address', 'overlay/index.html'],
  ])('serves nothing for %s (%s)', (_, url) => {
    expect(fileOf(url, root)).toBeNull();
  });

  it.each([
    ['app://sotto/../../secrets.txt'],
    ['app://sotto/%2e%2e/%2e%2e/secrets.txt'],
    ['app://sotto/overlay/../../../secrets.txt'],
  ])('keeps a climb out of %s inside the built pages, as the address resolves it', (url) => {
    expect(fileOf(url, root)).toBe(join(root, 'secrets.txt'));
  });

  it('keeps every file it serves inside the built pages', () => {
    for (const path of ['a', 'a/b/c.js', 'x/../y.js', './z.js', 'deep/../../escape.js']) {
      const file = fileOf(`app://sotto/${path}`, root);
      if (file) expect(file.startsWith(root)).toBe(true);
    }
  });
});
