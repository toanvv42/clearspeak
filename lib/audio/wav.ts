export const TARGET_SAMPLE_RATE = 16000;
export const MAX_RECORDING_SECONDS = 30;
export const MIN_RECORDING_MS = 750;

export function flattenChunks(chunks: Float32Array[]): Float32Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Band-limited resampling to 16 kHz via windowed-sinc interpolation.
 *
 * Plain linear interpolation has no anti-alias filtering, so energy above the
 * 8 kHz output Nyquist folds back into the speech band and can distort the
 * high-frequency consonants (final consonants, sibilants) this app assesses.
 * Each output sample is instead convolved with a Blackman-windowed sinc
 * low-pass kernel whose cutoff sits just below the output Nyquist frequency.
 * Never assumes the device already uses 16 kHz.
 */
export function resampleTo16k(samples: Float32Array, fromRate: number): Float32Array {
  if (!Number.isFinite(fromRate) || fromRate <= 0) {
    throw new Error("Invalid source sample rate");
  }
  if (samples.length === 0) return new Float32Array(0);
  if (fromRate === TARGET_SAMPLE_RATE) return Float32Array.from(samples);
  const ratio = fromRate / TARGET_SAMPLE_RATE; // input samples per output sample
  const outLength = Math.max(1, Math.floor(samples.length / ratio));
  // Cutoff in cycles per input sample: output Nyquist mapped back to the
  // input rate, with a small guard band. For upsampling the input Nyquist
  // itself is the limit.
  const cutoff = 0.5 * Math.min(1, 1 / ratio) * 0.92;
  // Kernel half-width in input samples; wider for larger downsample factors
  // so the time span (and stop-band attenuation) stays roughly constant.
  const half = Math.max(16, Math.ceil(32 * Math.max(1, ratio)));
  const out = new Float32Array(outLength);
  const blackman = (x: number) => {
    // x in [-1, 1]
    return 0.42 - 0.5 * Math.cos(Math.PI * (x + 1)) + 0.08 * Math.cos(2 * Math.PI * (x + 1));
  };
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const lo = Math.max(0, Math.floor(pos) - half);
    const hi = Math.min(samples.length - 1, Math.ceil(pos) + half);
    let acc = 0;
    let norm = 0;
    for (let k = lo; k <= hi; k++) {
      const n = k - pos; // distance in input samples
      // Ideal low-pass impulse response; the n=0 value is the true limit 2*fc.
      const sinc = n === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * n) / (Math.PI * n);
      const x = Math.max(-1, Math.min(1, n / half));
      const w = sinc * blackman(x);
      acc += samples[k] * w;
      norm += w;
    }
    // Unity DC gain so constant signals pass through unchanged.
    out[i] = norm !== 0 ? acc / norm : 0;
  }
  return out;
}

/**
 * Prefer the browser's asynchronous audio rendering pipeline so longer
 * recordings do not run the sinc convolution on the UI thread. The tested
 * synchronous resampler remains a compatibility fallback.
 */
export async function resampleTo16kAsync(
  samples: Float32Array,
  fromRate: number,
): Promise<Float32Array> {
  if (!Number.isFinite(fromRate) || fromRate <= 0) {
    throw new Error("Invalid source sample rate");
  }
  if (samples.length === 0) return new Float32Array(0);
  if (fromRate === TARGET_SAMPLE_RATE) return Float32Array.from(samples);
  if (typeof OfflineAudioContext === "undefined") return resampleTo16k(samples, fromRate);

  const outputLength = Math.max(
    1,
    Math.floor((samples.length * TARGET_SAMPLE_RATE) / fromRate),
  );
  try {
    const context = new OfflineAudioContext(1, outputLength, TARGET_SAMPLE_RATE);
    const input = context.createBuffer(1, samples.length, fromRate);
    input.getChannelData(0).set(samples);
    const source = context.createBufferSource();
    source.buffer = input;
    source.connect(context.destination);
    source.start(0);
    const rendered = await context.startRendering();
    return Float32Array.from(rendered.getChannelData(0));
  } catch {
    // Some older browsers expose OfflineAudioContext but reject uncommon
    // source rates. Preserve recording support with the quality fallback.
    return resampleTo16k(samples, fromRate);
  }
}

export function floatTo16BitPCM(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clipped = Math.max(-1, Math.min(1, samples[i]));
    out[i] = clipped < 0 ? Math.round(clipped * 0x8000) : Math.round(clipped * 0x7fff);
  }
  return out;
}

/** Encode mono 16-bit PCM WAV at 16 kHz. Returns the raw bytes. */
export function encodeWav(samples16k: Float32Array): ArrayBuffer {
  const pcm = floatTo16BitPCM(samples16k);
  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < pcm.length; i++) {
    view.setInt16(44 + i * 2, pcm[i], true);
  }
  return buffer;
}

export type BuiltWav = {
  blob: Blob;
  durationMs: number;
  sampleCount: number;
};

/** Resample arbitrary-rate mono input, encode WAV, and wrap in a Blob. */
export function buildWavFromMono(samples: Float32Array, sourceRate: number): BuiltWav {
  const resampled = resampleTo16k(samples, sourceRate);
  const buffer = encodeWav(resampled);
  const bytes = new Uint8Array(buffer);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "audio/wav" });
  return {
    blob,
    durationMs: (resampled.length / TARGET_SAMPLE_RATE) * 1000,
    sampleCount: resampled.length,
  };
}

/** Build a WAV without blocking the browser UI when native offline rendering is available. */
export async function buildWavFromMonoAsync(
  samples: Float32Array,
  sourceRate: number,
): Promise<BuiltWav> {
  const resampled = await resampleTo16kAsync(samples, sourceRate);
  const buffer = encodeWav(resampled);
  const bytes = new Uint8Array(buffer);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "audio/wav" });
  return {
    blob,
    durationMs: (resampled.length / TARGET_SAMPLE_RATE) * 1000,
    sampleCount: resampled.length,
  };
}

export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
