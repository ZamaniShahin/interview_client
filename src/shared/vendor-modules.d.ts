// Types for the two modules the documents window (src/renderer/documents) imports without their own (3.10). Here, in
// shared, so both the renderers' and main's type-checks (the tests import the window's code) see them.

declare module 'mammoth/mammoth.browser.js' {
  /** mammoth's browser build: a .docx's raw text, its paragraphs separated by empty lines. */
  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
  };
  export default mammoth;
}

declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  /** pdf.js's worker, run in the page's own thread: pdf.js finds it as `globalThis.pdfjsWorker`. */
  export const WorkerMessageHandler: unknown;
}
