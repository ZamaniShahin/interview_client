import { resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

// The renderers' Content Security Policy. A built page loads only its own files and talks to no one: main owns every
// connection (README, "Processes and windows"). Development adds the dev server's websocket, for hot reload.
function contentSecurityPolicy(dev: boolean): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    // Vue's component styles and style bindings are inline.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    dev ? "connect-src 'self' ws://localhost:*" : "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

function cspPlugin(): Plugin {
  let dev = false;
  return {
    name: 'sotto-csp',
    configResolved(config) {
      dev = config.command === 'serve';
    },
    transformIndexHtml(html) {
      return html.replace('__SOTTO_CSP__', contentSecurityPolicy(dev));
    },
  };
}

export default defineConfig({
  main: {},
  preload: {
    build: {
      // A sandboxed preload can't load other files, so each is built whole, with no shared chunk split out.
      isolatedEntries: true,
      externalizeDeps: false,
      rollupOptions: {
        input: {
          overlay: resolve('src/preload/overlay.ts'),
          app: resolve('src/preload/app.ts'),
        },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [vue(), cspPlugin()],
    build: {
      rollupOptions: {
        input: {
          overlay: resolve('src/renderer/overlay/index.html'),
          app: resolve('src/renderer/app/index.html'),
        },
      },
    },
  },
});
