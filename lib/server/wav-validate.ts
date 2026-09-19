import { createHash } from "node:crypto";
import { TARGET_SAMPLE_RATE } from "@/lib/audio/wav";

export const MAX_WAV_BYTES = 2 * 1024 * 1024;
export const MAX_DURATION_MS = 32_000;
export const MIN_DURATION_MS = 500;
const DURATION_TOLERANCE_MS = 1500;

export type ValidatedWav = {
  bytes: Buffer;
  byteLength: number;
  sha256: string;
  channels: number;
  sampleRate: number;
  bits: number;
  durationMs: number;
};

function readAscii(view: DataView, offset: number, length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

export function validateWavBytes(input: Uint8Array | Buffer, declaredDurationMs?: number): ValidatedWav {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length < 44) throw new Error("malformed-wav: too small");
  if (bytes.length > MAX_WAV_BYTES) throw new Error("oversize-wav");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") {
    throw new Error("malformed-wav: missing RIFF/WAVE");
  }
  if (readAscii(view, 12, 4) !== "fmt ") throw new Error("malformed-wav: missing fmt");
  const audioFormat = view.getUint16(20, true);
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bits = view.getUint16(34, true);
  if (audioFormat !== 1) throw new Error("unsupported-wav: only PCM");
  if (channels !== 1) throw new Error("unsupported-wav: must be mono");
  if (sampleRate !== TARGET_SAMPLE_RATE) throw new Error("unsupported-wav: must be 16 kHz");
  if (bits !== 16) throw new Error("unsupported-wav: must be 16-bit");
  if (readAscii(view, 36, 4) !== "data") throw new Error("malformed-wav: missing data chunk");
  const dataBytes = view.getUint32(40, true);
  if (dataBytes !== bytes.length - 44) throw new Error("malformed-wav: length mismatch");
  const durationMs = (dataBytes / 2 / TARGET_SAMPLE_RATE) * 1000;
  if (durationMs < MIN_DURATION_MS) throw new Error("wav-too-short");
  if (durationMs > MAX_DURATION_MS + DURATION_TOLERANCE_MS) throw new Error("wav-too-long");
  if (
    declaredDurationMs !== undefined &&
    Number.isFinite(declaredDurationMs) &&
    Math.abs(declaredDurationMs - durationMs) > DURATION_TOLERANCE_MS
  ) {
    throw new Error("duration-mismatch");
  }
  return {
    bytes,
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    channels,
    sampleRate,
    bits,
    durationMs: Math.round(durationMs),
  };
}
