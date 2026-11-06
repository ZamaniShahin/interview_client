import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  test: {
    include: ['tests/**/*.test.ts'],
    // Main and shared code run in Node; a renderer test opts into a DOM with `// @vitest-environment happy-dom`.
    environment: 'node',
  },
});
