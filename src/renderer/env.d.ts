/// <reference types="vite/client" />
import type { AppApi, OverlayApi, SelectorApi } from '../preload/api';

declare global {
  interface Window {
    /** The overlay's bridge to main (src/preload/overlay.ts); undefined in the app window. */
    overlayApi: OverlayApi;
    /** The app window's bridge to main (src/preload/app.ts); undefined in the overlay. */
    appApi: AppApi;
    /** The screenshot region selector's bridge (src/preload/selector.ts, 3.6); undefined elsewhere. */
    selectorApi: SelectorApi;
  }
}

export {};
