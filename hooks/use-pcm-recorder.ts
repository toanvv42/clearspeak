"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildWavFromMonoAsync, flattenChunks, MAX_RECORDING_SECONDS } from "@/lib/audio/wav";

export type RecorderStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "stopped"
  | "error"
  | "unsupported";

export type FinishedRecording = {
  blob: Blob;
  url: string;
  durationMs: number;
};

export type RecorderStartResult =
  | { ok: true }
  | { ok: false; unsupported: boolean; message: string };

export type PcmRecorderOptions = {
  /** Called (alongside the automatic finish) when the 30-second limit stops recording. */
  onAutoStop?: () => void;
};

/**
 * Non-throwing AudioWorklet feature check.
 * Uses the `in` operator so the Web IDL `audioWorklet` getter on
 * `AudioContext.prototype` is never invoked (calling it with the prototype as
 * receiver throws `TypeError: Illegal invocation` in Chromium).
 */
export function isAudioWorkletSupported(): boolean {
  if (typeof window === "undefined") return false;
  const AC = window.AudioContext;
  if (typeof AC === "undefined" || !AC.prototype) return false;
  return "audioWorklet" in AC.prototype;
}

type WorkletMessage =
  | { type: "chunk"; chunk: Float32Array }
  | { type: "level"; peak: number };

export function usePcmRecorder(options?: PcmRecorderOptions) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<FinishedRecording | null>(null);
  const [autoStopped, setAutoStopped] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const sinkRef = useRef<GainNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);
  const lastLevelRef = useRef(0);
  const finishRef = useRef<((auto: boolean) => Promise<FinishedRecording | null>) | null>(null);
  const autoStopRef = useRef<PcmRecorderOptions["onAutoStop"]>(undefined);
  /** Synchronous guard: only one finish operation may own a recording session. */
  const finishingRef = useRef(false);
  /** Once a session has produced its recording, later finish calls are no-ops. */
  const sessionDoneRef = useRef(false);
  /** Ensures onAutoStop fires at most once per recording. */
  const autoStopFiredRef = useRef(false);
  /** The current finished object URL is owned by this ref (never stale state). */
  const urlRef = useRef<string | null>(null);
  /** Invalidates asynchronous audio preparation after cancel or a new start. */
  const sessionIdRef = useRef(0);

  useEffect(() => {
    autoStopRef.current = options?.onAutoStop;
  }, [options?.onAutoStop]);

  const disconnectNode = (node: { disconnect: () => void } | null) => {
    if (!node) return;
    try {
      node.disconnect();
    } catch {
      /* ignore */
    }
  };

  /**
   * One idempotent cleanup routine for every audio resource: auto-stop timer,
   * worklet/source/sink nodes, worklet message handler, AudioContext, and
   * microphone tracks.
   */
  const releaseAudioResources = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (nodeRef.current) {
      try {
        nodeRef.current.port.onmessage = null;
      } catch {
        /* ignore */
      }
      disconnectNode(nodeRef.current);
      nodeRef.current = null;
    }
    disconnectNode(sourceRef.current);
    sourceRef.current = null;
    disconnectNode(sinkRef.current);
    sinkRef.current = null;
    if (ctxRef.current) {
      const ctx = ctxRef.current;
      ctxRef.current = null;
      void ctx.close().catch(() => {});
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      }
      streamRef.current = null;
    }
  }, []);

  /** Revoke the owned object URL and clear the finished recording. */
  const clearFinished = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setFinished(null);
  }, []);

  // Keep finishRef current so the auto-stop timer never calls a stale closure.
  const finish = useCallback(
    async (auto = false): Promise<FinishedRecording | null> => {
      // Atomic ownership: a second concurrent finish (double-click, or a click
      // racing the auto-stop timer) is a no-op instead of consuming an
      // already-claimed chunk list and replacing the valid WAV with silence.
      // A session produces exactly one recording; later calls are no-ops.
      if (finishingRef.current || sessionDoneRef.current) return null;
      const sessionId = sessionIdRef.current;
      finishingRef.current = true;
      setFinishing(true);
      // Stop the auto-stop timer before consuming chunks.
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const chunks = chunksRef.current;
      chunksRef.current = [];
      setLevel(0);
      const ctx = ctxRef.current;
      const sourceRate = ctx?.sampleRate ?? 48000;
      // Stop capture immediately. Native offline rendering below is async, so
      // React can paint the Preparing audio state while it completes.
      releaseAudioResources();
      try {
        const flat = flattenChunks(chunks);
        const { blob, durationMs } = await buildWavFromMonoAsync(flat, sourceRate);
        if (sessionId !== sessionIdRef.current) return null;
        // Duration is sample-based only: wall-clock time must never inflate an
        // empty WAV past the minimum-duration check.
        const url = URL.createObjectURL(blob);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        const recording = { blob, url, durationMs };
        setFinished(recording);
        setAutoStopped(auto);
        setStatus("stopped");
        sessionDoneRef.current = true;
        return recording;
      } catch {
        setError("Could not build the recording. Please try again.");
        setStatus("error");
        return null;
      } finally {
        if (sessionId === sessionIdRef.current) {
          finishingRef.current = false;
          setFinishing(false);
        }
      }
    },
    [releaseAudioResources],
  );

  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  const cancel = useCallback(() => {
    sessionIdRef.current++;
    chunksRef.current = [];
    finishingRef.current = false;
    sessionDoneRef.current = false;
    autoStopFiredRef.current = false;
    setFinishing(false);
    clearFinished();
    setAutoStopped(false);
    setElapsedMs(0);
    setLevel(0);
    setStatus("idle");
    releaseAudioResources();
  }, [clearFinished, releaseAudioResources]);

  const start = useCallback(async (): Promise<RecorderStartResult> => {
    sessionIdRef.current++;
    // A previous recording URL is revoked before it is cleared.
    clearFinished();
    finishingRef.current = false;
    sessionDoneRef.current = false;
    autoStopFiredRef.current = false;
    setFinishing(false);
    setError(null);
    setAutoStopped(false);
    setElapsedMs(0);
    setLevel(0);
    if (!isAudioWorkletSupported()) {
      const message =
        "Your browser does not support AudioWorklet recording. Try a recent Chrome, Edge, or Safari.";
      setStatus("unsupported");
      setError(message);
      return { ok: false, unsupported: true, message };
    }
    // Stop any sample playback so the mic does not pick it up.
    try {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      let ctx: AudioContext;
      try {
        const Ctx = window.AudioContext;
        ctx = new Ctx();
      } catch {
        releaseAudioResources();
        const message = "Could not start audio capture. Please try again.";
        setError(message);
        setStatus("error");
        return { ok: false, unsupported: false, message };
      }
      ctxRef.current = ctx;
      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => {});
      }
      // Verify Worklet support on the real instance before use; the static
      // check above cannot prove `addModule` exists here.
      if (!ctx.audioWorklet || typeof ctx.audioWorklet.addModule !== "function") {
        releaseAudioResources();
        const message =
          "Your browser does not support AudioWorklet recording. Try a recent Chrome, Edge, or Safari.";
        setStatus("unsupported");
        setError(message);
        return { ok: false, unsupported: true, message };
      }
      try {
        await ctx.audioWorklet.addModule("/pcm-recorder-worklet.js");
      } catch {
        releaseAudioResources();
        const message = "Could not load the audio recorder. Please reload and try again.";
        setError(message);
        setStatus("error");
        return { ok: false, unsupported: false, message };
      }
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const node = new AudioWorkletNode(ctx, "pcm-recorder");
      nodeRef.current = node;
      chunksRef.current = [];
      node.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
        const msg = event.data;
        if (msg.type === "chunk") {
          // Copy: never retain the browser-owned buffer.
          chunksRef.current.push(Float32Array.from(msg.chunk));
        } else if (msg.type === "level") {
          const now = Date.now();
          if (now - lastLevelRef.current > 70) {
            lastLevelRef.current = now;
            setLevel(Math.max(0, Math.min(1, msg.peak)));
          }
        }
      };
      source.connect(node);
      // Connect through a zero-gain node so the worklet runs without audible feedback.
      const sink = ctx.createGain();
      sink.gain.value = 0;
      sinkRef.current = sink;
      node.connect(sink);
      sink.connect(ctx.destination);

      startRef.current = Date.now();
      setStatus("recording");
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startRef.current);
        if (Date.now() - startRef.current >= MAX_RECORDING_SECONDS * 1000) {
          if (autoStopFiredRef.current) return;
          autoStopFiredRef.current = true;
          // Notify immediately so the UI can leave the recording screen and
          // paint its Preparing audio state while asynchronous resampling runs.
          autoStopRef.current?.();
          void finishRef.current?.(true);
        }
      }, 200);
      return { ok: true };
    } catch (err) {
      let message = "Could not start recording. Please try again.";
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        message = "Microphone access was denied. Allow microphone access and try again.";
      } else if (err instanceof DOMException && err.name === "NotFoundError") {
        message = "No microphone was found. Connect a microphone and try again.";
      }
      setError(message);
      setStatus("error");
      releaseAudioResources();
      return { ok: false, unsupported: false, message };
    }
  }, [clearFinished, releaseAudioResources]);

  // Cleanup on unmount without calling React state setters: revoke the owned
  // URL directly from the ref and release all audio resources.
  useEffect(() => {
    const sessionId = sessionIdRef;
    return () => {
      sessionId.current++;
      releaseAudioResources();
      try {
        if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [releaseAudioResources]);

  return {
    status,
    elapsedMs,
    level,
    error,
    finished,
    autoStopped,
    finishing,
    start,
    finish,
    cancel,
  };
}

export type PcmRecorder = ReturnType<typeof usePcmRecorder>;
