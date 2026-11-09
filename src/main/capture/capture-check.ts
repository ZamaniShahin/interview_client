// `--capture-check`, in an unpackaged build only (scripts/capture-check.mjs): the real capture path on this computer,
// with nothing shown. It opens only the hidden capture window, through the same code a session uses, counts what
// arrives for a few seconds, prints the numbers as one JSON line and quits: 0 when frames came, 1 when none did.
// Nothing is uploaded, kept or played.
import { app } from 'electron';
import { frameBytes } from '../../shared/audio/frames';
import { openCaptureWindow } from '../windows/capture-window';
import { AudioCapture } from './audio-capture';

export function runCaptureCheck(seconds = 6): void {
  void app.whenReady().then(() => {
    let started = false;
    let frames = 0;
    let wrongSize = 0;
    let loudest = 0;
    const failures: string[] = [];
    // Before main's checks: how many frame messages came, and what their audio arrived as.
    let rawFrames = 0;
    const arrivedAs = new Set<string>();

    const capture = new AudioCapture({
      open: () => {
        const channel = openCaptureWindow();
        channel.onMessage((message) => {
          const m = message as { type?: unknown; reason?: unknown; pcm?: unknown } | null;
          if (m?.type === 'started') started = true;
          if (m?.type === 'failed' || m?.type === 'lost') failures.push(`${String(m.type)}: ${String(m.reason)}`);
          if (m?.type === 'frame') {
            rawFrames++;
            arrivedAs.add(Object.prototype.toString.call(m.pcm));
          }
        });
        return channel;
      },
      onFrame: (pcm) => {
        frames++;
        if (pcm.byteLength !== frameBytes) wrongSize++;
      },
      onStatus: (status) => {
        if (status.level !== null) loudest = Math.max(loudest, status.level);
      },
    });

    capture.start();
    setTimeout(() => {
      capture.stop();
      const result = {
        started,
        frames,
        framesPerSecond: Number((frames / seconds).toFixed(1)),
        wrongSize,
        loudest: Number(loudest.toFixed(3)),
        failures,
        rawFrames,
        arrivedAs: [...arrivedAs],
      };
      console.log(JSON.stringify(result));
      app.exit(started && frames > 0 && wrongSize === 0 ? 0 : 1);
    }, seconds * 1000);
  });
}
