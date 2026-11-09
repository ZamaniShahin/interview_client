// The AudioWorklet's own scope (AudioWorkletGlobalScope), which TypeScript's DOM library doesn't describe: just what
// pcm-worklet.ts uses.
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;
