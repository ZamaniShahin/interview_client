// Automatic updates (4.2): main checks the update feed, downloads a newer version in the background, and installs it
// when the app quits, or at once when the user asks, outside a session. The windows only see where it stands.

export type UpdateView =
  /** No feed is set for this build (development, or a build made before the domain was chosen, Q4). */
  | { status: 'off' }
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'downloading'; version: string; percent: number }
  /** Downloaded: it installs when the app quits, or now on "Restart to update". */
  | { status: 'ready'; version: string }
  | { status: 'failed' };

export const updatesOff: UpdateView = { status: 'off' };
