// Lint, including the stealth rules a linter can see (README, "Stealth rules"): no `title` attribute and no <select>
// in templates. The cursor rule lives in CSS, which tests/stealth/source-rules.test.ts checks instead.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const tooltip = 'Stealth rule 2: a tooltip is a separate window a screen share can see. Use aria-label.';

export default defineConfig(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'src/shared/contracts/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'], sourceType: 'module' },
    },
  },
  {
    files: ['src/renderer/**/*.{ts,vue}', 'tests/renderer/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'scripts/**/*.mjs', '*.config.{ts,mts,mjs}', 'tests/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/renderer/**/*.vue'],
    rules: {
      'vue/no-restricted-static-attribute': ['error', { key: 'title', message: tooltip }],
      'vue/no-restricted-v-bind': ['error', { argument: 'title', message: tooltip }],
      'vue/no-restricted-html-elements': [
        'error',
        { element: 'select', message: "Stealth rule 3: a native dropdown's list is a separate window. Use SSegmented or SOptionList." },
      ],
    },
  },
  prettier,
);
