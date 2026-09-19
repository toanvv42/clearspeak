import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildWavFromMonoAsync,
  buildWavFromMono,
  encodeWav,
  flattenChunks,
  floatTo16BitPCM,
  resampleTo16k,
  TARGET_SAMPLE_RATE,
} from "@/lib/audio/wav";

afterEach(() => {
  vi.unstubAllGlobals();
});

function readHeader(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const ascii = (o: number, n: number) =>
    Array.from({ length: n }, (_, i) => String.fromCharCode(view.getUint8(o + i))).join("");
  return {
    riff: ascii(0, 4),
    wave: ascii(8, 4),
    fmt: ascii(12, 4),
    data: ascii(36, 4),
    audioFormat: view.getUint16(20, true),
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    byteRate: view.getUint32(28, true),
    blockAlign: view.getUint16(32, true),
    bitsPerSample: view.getUint16(34, true),
    dataBytes: view.getUint32(40, true),
  };
}

describe("wav encoding", () => {
  it("writes correct RIFF markers and mono 16k PCM16 header fields", () => {
    const samples = new Float32Array(TARGET_SAMPLE_RATE); // 1 second of silence
    const buffer = encodeWav(samples);
    const h = readHeader(buffer);
    expect(h.riff).toBe("RIFF");
    expect(h.wave).toBe("WAVE");
    expect(h.fmt).toBe("fmt ");
    expect(h.data).toBe("data");
    expect(h.audioFormat).toBe(1);
    expect(h.channels).toBe(1);
    expect(h.sampleRate).toBe(16000);
    expect(h.bitsPerSample).toBe(16);
    expect(h.byteRate).toBe(32000);
    expect(h.blockAlign).toBe(2);
    expect(h.dataBytes).toBe(samples.length * 2);
    expect(buffer.byteLength).toBe(44 + samples.length * 2);
  });

  it("clips samples to [-1, 1]", () => {
    const pcm = floatTo16BitPCM(new Float32Array([2, -2, 1, -1, 0]));
    expect(pcm[0]).toBe(32767);
    expect(pcm[1]).toBe(-32768);
    expect(pcm[2]).toBe(32767);
    expect(pcm[3]).toBe(-32768);
    expect(pcm[4]).toBe(0);
  });

  it("resamples common input rates to 16 kHz", () => {
    for (const rate of [44100, 48000, 8000, 16000, 22050]) {
      const oneSecond = new Float32Array(rate).fill(0.5);
      const out = resampleTo16k(oneSecond, rate);
      expect(Math.abs(out.length - TARGET_SAMPLE_RATE)).toBeLessThanOrEqual(2);
    }
  });

  it("does not assume the device already uses 16 kHz", () => {
    const out = resampleTo16k(new Float32Array([0, 0.5, 1, 0.5]), 8000);
    expect(out.length).toBeGreaterThan(4);
  });

  it("flattens chunks efficiently", () => {
    const flat = flattenChunks([new Float32Array([1, 2]), new Float32Array([3])]);
    expect(Array.from(flat)).toEqual([1, 2, 3]);
    expect(flattenChunks([]).length).toBe(0);
  });

  it("reports duration from the resampled length", () => {
    const { durationMs, sampleCount } = buildWavFromMono(new Float32Array(48000).fill(0.1), 48000);
    expect(sampleCount).toBeGreaterThan(15000);
    expect(sampleCount).toBeLessThan(16100);
    expect(durationMs).toBeGreaterThan(900);
    expect(durationMs).toBeLessThan(1100);
  });

  it("uses asynchronous offline rendering when the browser provides it", async () => {
    const startRendering = vi.fn(async () => ({
      getChannelData: () => new Float32Array(TARGET_SAMPLE_RATE).fill(0.25),
    }));
    class FakeOfflineAudioContext {
      destination = {};
      createBuffer = () => {
        const channel = new Float32Array(48000);
        return { getChannelData: () => channel };
      };
      createBufferSource = () => ({
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
      });
      startRendering = startRendering;
    }
    vi.stubGlobal("OfflineAudioContext", FakeOfflineAudioContext);
    const built = await buildWavFromMonoAsync(new Float32Array(48000).fill(0.25), 48000);
    expect(startRendering).toHaveBeenCalledOnce();
    expect(built.durationMs).toBe(1000);
    expect(built.blob.size).toBe(44 + TARGET_SAMPLE_RATE * 2);
  });

  function sine(freq: number, rate: number, seconds = 1): Float32Array {
    const n = Math.floor(rate * seconds);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = 0.9 * Math.sin((2 * Math.PI * freq * i) / rate);
    return out;
  }

  function rms(samples: Float32Array): number {
    let sum = 0;
    for (const v of samples) sum += v * v;
    return Math.sqrt(sum / samples.length);
  }

  it("suppresses input tones above the 8 kHz output Nyquist", () => {
    for (const rate of [48000, 44100]) {
      const out = resampleTo16k(sine(12000, rate), rate);
      const center = out.slice(4000, 12000);
      expect(rms(center) / rms(sine(12000, rate))).toBeLessThan(0.05);
    }
  });

  it("preserves speech-band tones and bounds amplitude", () => {
    for (const [freq, rate] of [
      [1000, 48000],
      [1000, 44100],
      [300, 8000],
    ] as Array<[number, number]>) {
      const input = sine(freq, rate);
      const out = resampleTo16k(input, rate);
      const center = out.slice(4000, 12000);
      expect(rms(center) / rms(input)).toBeGreaterThan(0.9);
      let peak = 0;
      for (const v of out) peak = Math.max(peak, Math.abs(v));
      expect(peak).toBeLessThanOrEqual(1);
      expect(Number.isFinite(peak)).toBe(true);
    }
  });
});
