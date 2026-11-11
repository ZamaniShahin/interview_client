// The hidden documents window (3.10), never shown, with no UI and no network. It reads the files main sends it, through
// the port main handed over, and answers each with its text, or why there is none. Main checks every answer
// (main/documents/document-reader.ts); nothing else reaches main from here.
import { IpcChannels } from '../../shared/ipc-channels';
import { docxText, failureOf, pdfText } from './extract';

let port: MessagePort | null = null;

window.addEventListener('message', (event) => {
  // Only the preload's message, from this page's own window, carries the port.
  if (event.source !== window || event.data !== IpcChannels.documentsPort || port) return;
  port = event.ports[0] ?? null;
  if (!port) return;
  port.addEventListener('message', (message) => void read(message.data));
  port.start();
});

async function read(request: unknown): Promise<void> {
  const { id, kind, bytes } = (request ?? {}) as { id?: unknown; kind?: unknown; bytes?: unknown };
  if (typeof id !== 'string' || (kind !== 'pdf' && kind !== 'docx') || !(bytes instanceof Uint8Array)) return;
  try {
    const text = kind === 'pdf' ? await pdfText(bytes) : await docxText(bytes);
    port?.postMessage(text.trim() ? { id, ok: true, text } : { id, ok: false, reason: 'empty' });
  } catch (error) {
    port?.postMessage({ id, ok: false, reason: failureOf(error) });
  }
}
