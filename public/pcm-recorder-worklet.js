/**
 * pcm-recorder-worklet.js
 * Captures mono Float32 PCM frames in memory and reports peak level.
 * Loaded via audioWorklet.addModule("/pcm-recorder-worklet.js").
 */
class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._lastLevelPost = 0;
  }

  process(inputs) {
    const input = inputs && inputs[0];
    if (input && input.length > 0) {
      const channel = input[0];
      if (channel && channel.length > 0) {
        // Copy before posting: never retain the browser-owned buffer.
        const copy = new Float32Array(channel.length);
        copy.set(channel);
        let peak = 0;
        for (let i = 0; i < copy.length; i++) {
          const v = Math.abs(copy[i]);
          if (v > peak) peak = v;
        }
        this.port.postMessage({ type: "chunk", chunk: copy }, [copy.buffer]);
        const now = Date.now();
        if (now - this._lastLevelPost > 70) {
          this._lastLevelPost = now;
          this.port.postMessage({ type: "level", peak });
        }
      }
    }
    return true;
  }
}

registerProcessor("pcm-recorder", PcmRecorderProcessor);
