// What the app tests share: launching the built app against the preview, finding its windows, and reading a window's
// display affinity the way Windows reports it.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core';

export const root = fileURLToPath(new URL('../..', import.meta.url));

/** The app tests run when asked (`node scripts/app-tests.mjs`), and only on Windows. */
export const runAppTests = process.env['SOTTO_APP'] === '1' && process.platform === 'win32';

/** WDA_EXCLUDEFROMCAPTURE: the window is left out of every capture, a screen share's included. */
export const excludedFromCapture = 0x11;

/** The built app (a preview build in out/), started as from VS Code but without its ELECTRON_RUN_AS_NODE. */
export function launch(): Promise<ElectronApplication> {
  const env = { ...process.env } as Record<string, string>;
  delete env['ELECTRON_RUN_AS_NODE'];
  return electron.launch({ args: ['.'], cwd: root, env });
}

/** The window whose page's address contains `part`, once it exists. */
export async function page(app: ElectronApplication, part: string): Promise<Page> {
  for (let i = 0; i < 200; i++) {
    const found = app.windows().find((w) => w.url().includes(part));
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No ${part} window.`);
}

/** Each window's display affinity, read with user32's GetWindowDisplayAffinity. */
export function displayAffinity(handles: string[]): number[] {
  const script =
    "$ProgressPreference = 'SilentlyContinue'\n" +
    'Add-Type -Namespace Sotto -Name Win -MemberDefinition \'[DllImport("user32.dll")] public static extern bool ' +
    "GetWindowDisplayAffinity(IntPtr hWnd, out uint affinity);'\n" +
    `foreach ($h in @(${handles.join(',')})) { $a = [uint32]0; [void][Sotto.Win]::GetWindowDisplayAffinity([IntPtr][int64]$h, [ref]$a); $a }`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out.trim().split(/\r?\n/).map(Number);
}

/** DWMSBT_TRANSIENTWINDOW: the system backdrop Electron's `backgroundMaterial: 'acrylic'` asks of Windows. */
export const acrylicBackdrop = 3;

/** WS_EX_LAYERED: a window composited as a layer of its own, as Electron's setOpacity makes one. */
const layeredStyle = 0x80000;

/**
 * How Windows draws each window, read from Windows itself and never from the screen: whether it is layered, the
 * system backdrop DWM was asked for (DWMWA_SYSTEMBACKDROP_TYPE), and whether its frame and backdrop are dark
 * (DWMWA_USE_IMMERSIVE_DARK_MODE).
 */
export function windowLook(handles: string[]): { layered: boolean; backdrop: number; dark: boolean }[] {
  const script =
    "$ProgressPreference = 'SilentlyContinue'\n" +
    "Add-Type -Namespace Sotto -Name Look -MemberDefinition '" +
    '[DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int index);' +
    '[DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out int value, int size);' +
    "'\n" +
    `foreach ($h in @(${handles.join(',')})) { $w = [IntPtr][int64]$h; ` +
    '$ex = [Sotto.Look]::GetWindowLongPtr($w, -20).ToInt64(); ' +
    '$b = 0; [void][Sotto.Look]::DwmGetWindowAttribute($w, 38, [ref]$b, 4); ' +
    '$d = 0; [void][Sotto.Look]::DwmGetWindowAttribute($w, 20, [ref]$d, 4); ' +
    '"$ex $b $d" }';
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const [style, backdrop, dark] = line.trim().split(' ').map(Number) as [number, number, number];
      return { layered: (style & layeredStyle) !== 0, backdrop, dark: dark !== 0 };
    });
}

/** Every window: its page, its native handle, whether it is on screen. */
export function windowsOf(app: ElectronApplication) {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => ({
      url: w.webContents.getURL(),
      handle: w.getNativeWindowHandle().readBigUInt64LE(0).toString(),
      visible: w.isVisible(),
    })),
  );
}
