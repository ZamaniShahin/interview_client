// Types for the two modules the documents window (src/renderer/documents) imports without their own (3.10). Here, in
// shared, so both the renderers' and main's type-checks (the tests import the window's code) see them.

declare module 'mammoth/mammoth.browser.js' {
  /**
   * One element of the document mammoth reads (its lib/documents.js): the parts the documents window walks. A table's
   * cells carry their spans; a cell merged down from the row above is left out of the rows below it.
   */
  export interface MammothElement {
    type: string;
    children?: MammothElement[];
    /** A text element's text. */
    value?: string;
    /** A break's kind: "line", "page" or "column". */
    breakType?: string;
    colSpan?: number;
    rowSpan?: number;
  }

  /**
   * mammoth's browser build. The documents window reads the document through `transformDocument`, which is handed the
   * whole document before it is converted; the HTML itself is left unused.
   */
  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
    convertToHtml(
      input: { arrayBuffer: ArrayBuffer },
      options?: { transformDocument?: (document: MammothElement) => MammothElement },
    ): Promise<{ value: string; messages: unknown[] }>;
  };
  export default mammoth;
}

declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  /** pdf.js's worker, run in the page's own thread: pdf.js finds it as `globalThis.pdfjsWorker`. */
  export const WorkerMessageHandler: unknown;
}
