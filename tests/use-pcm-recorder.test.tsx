import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeAudio, pushChunk, type FakeAudioHarness } from "@/tests/fake-audio";
import { isAudioWorkletSupported, usePcmRecorder } from "@/hooks/use-pcm-recorder";

let harness: FakeAudioHarness | null = null;

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  harness?.uninstall();
  harness = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("isAudioWorkletSupported", () => {
  it("does not throw when audioWorklet is a getter that rejects a prototype receiver", () => {
    class ProtoReceiver {}
    Object.defineProperty(ProtoReceiver.prototype, "audioWorklet", {
      get() {
        throw new TypeError("Illegal invocation");
      },
      configurable: true,
    });
    (window as unknown as Record<string, unknown>).AudioContext = ProtoReceiver;
    let result: boolean | undefined;
    expect(() => {
      result = isAudioWorkletSupported();
    }).not.toThrow();
    // The property exists, so support is reported without invoking the getter.
    expect(result).toBe(true);
    delete (window as unknown as Record<string, unknown>).AudioContext;
  });

  it("returns false when AudioContext or the worklet property is absent", () => {
    delete (window as unknown as Record<string, unknown>).AudioContext;
    expect(isAudioWorkletSupported()).toBe(false);
    class NoWorklet {}
    (window as unknown as Record<string, unknown>).AudioContext = NoWorklet;
    expect(isAudioWorkletSupported()).toBe(false);
    delete (window as unknown as Record<string, unknown>).AudioContext;
  });
});

describe("usePcmRecorder", () => {
  it("records worklet chunks into one non-empty sample-based WAV", async () => {
    harness = installFakeAudio({ sampleRate: 48000 });
    const onAutoStop = vi.fn();
    const { result } = renderHook(() => usePcmRecorder({ onAutoStop }));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.start();
    });
    expect(outcome).toEqual({ ok: true });
    expect(result.current.status).toBe("recording");
    act(() => {
      pushChunk(harness!, new Float32Array(4800).fill(0.5));
      pushChunk(harness!, new Float32Array(4800).fill(0.5));
    });
    let recording: unknown;
    await act(async () => {
      recording = await result.current.finish(false);
    });
    const rec = recording as { blob: Blob; durationMs: number };
    expect(rec).not.toBeNull();
    expect(rec.blob.size).toBeGreaterThan(44);
    // 9600 samples @48k -> 0.2s of audio; duration is sample-based.
    expect(rec.durationMs).toBeGreaterThan(150);
    expect(rec.durationMs).toBeLessThan(300);
    expect(onAutoStop).not.toHaveBeenCalled();
  });

  it("lets only one concurrent finish own the session (double Finish)", async () => {
    harness = installFakeAudio({ sampleRate: 48000 });
    const { result } = renderHook(() => usePcmRecorder({}));
    await act(async () => {
      await result.current.start();
    });
    act(() => {
      pushChunk(harness!, new Float32Array(4800).fill(0.5));
    });
    let r1: unknown;
    let r2: unknown;
    await act(async () => {
      [r1, r2] = await Promise.all([result.current.finish(false), result.current.finish(false)]);
    });
    const nonNull = [r1, r2].filter(Boolean);
    expect(nonNull).toHaveLength(1);
    expect((nonNull[0] as { blob: Blob }).blob.size).toBeGreaterThan(44);
  });

  it("auto-stops once at 30 seconds and ignores a racing manual finish", async () => {
    vi.useFakeTimers();
    harness = installFakeAudio({ sampleRate: 48000 });
    const onAutoStop = vi.fn();
    const { result } = renderHook(() => usePcmRecorder({ onAutoStop }));
    await act(async () => {
      await result.current.start();
    });
    act(() => {
      pushChunk(harness!, new Float32Array(4800).fill(0.5));
    });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onAutoStop).toHaveBeenCalledTimes(1);
    expect(result.current.finished?.blob.size).toBeGreaterThan(44);
    // A manual finish racing the timer afterwards is a no-op for a new result.
    let second: unknown = "unset";
    await act(async () => {
      second = await result.current.finish(false);
    });
    expect(second).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onAutoStop).toHaveBeenCalledTimes(1);
  });

  it("cleans up tracks and context when the worklet module fails to load", async () => {
    harness = installFakeAudio({
      addModule: async () => {
        throw new Error("load failed");
      },
    });
    const { result } = renderHook(() => usePcmRecorder({}));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.start();
    });
    expect(outcome).toMatchObject({ ok: false });
    expect(result.current.status).toBe("error");
    expect(harness.tracks).toHaveLength(1);
    expect(harness.tracks[0].stop).toHaveBeenCalled();
    expect(harness.contexts).toHaveLength(1);
    const close = harness.contexts[0]["close"] as ReturnType<typeof vi.fn>;
    expect(close).toHaveBeenCalled();
  });

  it("cleans up on microphone denial with no leaked tracks", async () => {
    harness = installFakeAudio({
      getUserMedia: async () => {
        throw new DOMException("denied", "NotAllowedError");
      },
    });
    const { result } = renderHook(() => usePcmRecorder({}));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.start();
    });
    expect(outcome).toMatchObject({ ok: false });
    expect(result.current.error).toMatch(/denied/i);
    expect(harness.tracks).toHaveLength(0);
  });

  it("revokes the previous URL on Start/Cancel and on unmount", async () => {
    harness = installFakeAudio({ sampleRate: 48000 });
    const { result, unmount } = renderHook(() => usePcmRecorder({}));
    await act(async () => {
      await result.current.start();
    });
    act(() => {
      pushChunk(harness!, new Float32Array(1600).fill(0.2));
    });
    let firstUrl = "";
    await act(async () => {
      const rec = await result.current.finish(false);
      firstUrl = rec!.url;
    });
    expect(firstUrl).toMatch(/^blob:/);
    await act(async () => {
      await result.current.start();
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstUrl);
    act(() => {
      result.current.cancel();
    });
    expect(result.current.status).toBe("idle");
    expect(harness.tracks.every((t) => t.stop.mock.calls.length > 0)).toBe(true);
    unmount();
  });
});
