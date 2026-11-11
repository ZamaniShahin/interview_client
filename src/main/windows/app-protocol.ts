// The built app's pages, served from inside the app at app://sotto/ (4.1) rather than from file://: a real origin of
// its own, so the Content Security Policy's 'self' means these files and nothing else on the disk, and file:// can lose
// its extra privileges (the GrantFileProtocolExtraPrivileges fuse, electron-builder.yml). Development keeps
// electron-vite's server.
import { join, normalize, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol, type Session } from 'electron';

export const appScheme = 'app';
export const appHost = 'sotto';

/** Before the app is ready: app:// is standard and secure, so its pages get a real origin and module scripts. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: appScheme, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** A page's address: app://sotto/<page>/index.html, with its mode after #. */
export function appUrl(page: string, hash?: string): string {
  return `${appScheme}://${appHost}/${page}/index.html${hash ? `#${hash}` : ''}`;
}

/**
 * The file an app:// address names, under `root` (the built renderer); null for any other host, a path that leaves
 * `root`, or anything but a plain path. Pure, so the tests read it without Electron.
 */
export function fileOf(url: string, root: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // Chromium lowercases a standard scheme's host; this reads one that wasn't, the same.
  if (
    parsed.protocol !== `${appScheme}:` ||
    parsed.host.toLowerCase() !== appHost ||
    parsed.username ||
    parsed.password
  )
    return null;
  let path: string;
  try {
    path = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (path.includes('\0') || path.includes('\\')) return null;
  const file = normalize(join(root, path));
  const inside = relative(root, file);
  if (!inside || inside.startsWith('..') || inside.split(sep).includes('..')) return null;
  return file;
}

/** Serves the built pages to `session`'s windows: each session that loads one needs it (capture and documents have their own). */
export function serveApp(session: Session, root: string): void {
  // Once per session: a second handler would throw, and a window opened again finds the first.
  if (session.protocol.isProtocolHandled(appScheme)) return;
  session.protocol.handle(appScheme, (request) => {
    const file = fileOf(request.url, root);
    if (!file) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}
