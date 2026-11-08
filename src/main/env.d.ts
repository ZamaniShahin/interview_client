// electron-vite replaces `import.meta.env.MODE` at build time in main too: `development`, `production`, or the
// `--mode` given (`preview` for `npm run dev:preview`).
interface ImportMetaEnv {
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
