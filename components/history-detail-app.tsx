"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AccessGate from "@/components/access-gate";
import AppHeader from "@/components/app-header";
import AttemptAudio from "@/components/attempt-audio";
import ComparisonView from "@/components/comparison-view";
import LastRecordingPlayer from "@/components/last-recording-player";
import ResultsView from "@/components/results-view";
import { deleteAttemptRequest, fetchAttemptAudioBlob, fetchAttemptDetail } from "@/lib/history/client";
import { clearAccessCode, hasAccessCode } from "@/lib/access-code";
import type { AttemptDetail } from "@/lib/history/types";

export default function HistoryDetailApp({ id, accessRequired }: { id: string; accessRequired: boolean }) {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(() => !accessRequired || hasAccessCode());
  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [announce, setAnnounce] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchAttemptDetail(id);
      setDetail(d);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 401 && accessRequired) {
        clearAccessCode();
        setUnlocked(false);
        return;
      }
      setError(status === 404 ? "not-found" : "Could not load this recording.");
    } finally {
      setLoading(false);
    }
  }, [id, accessRequired]);

  useEffect(() => {
    if (!unlocked) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [unlocked, load]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const loadAudio = useCallback(async () => {
    setAudioError(null);
    try {
      const blob = await fetchAttemptAudioBlob(id);
      const url = URL.createObjectURL(blob);
      setAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      setAudioError("Could not load audio. Try again.");
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (detail && !audioUrl && !audioError) void loadAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  if (accessRequired && !unlocked) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] dark:bg-stone-950">
        <AppHeader />
        <AccessGate onUnlock={() => setUnlocked(true)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f7f4] text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-20 sm:px-6">
        <Link href="/history" className="mt-6 inline-block text-sm font-semibold text-[#2563eb]">
          ← History
        </Link>
        {announce && (
          <p role="status" className="rounded-2xl bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
            {announce}
          </p>
        )}
        {loading && <p className="mt-4 text-sm">Loading…</p>}
        {error === "not-found" && (
          <div className="mt-4 rounded-3xl border bg-white p-8 text-center">
            <p className="font-bold">This recording could not be found.</p>
            <Link href="/history" className="mt-3 inline-block font-semibold text-[#2563eb]">
              Back to history
            </Link>
          </div>
        )}
        {error && error !== "not-found" && (
          <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm">
            {error} <button type="button" onClick={() => void load()} className="underline">Retry</button>
          </p>
        )}
        {detail && (
          <>
            <div className="rounded-3xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
              <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">
                {new Date(detail.recordedAt).toLocaleString()} · {Math.round(detail.durationMs / 1000)}s
                {detail.stopReason === "limit" ? " · full 30 seconds" : ""}
              </p>
              <h1 className="mt-1 text-xl font-extrabold tracking-tight">{detail.title ?? "Custom text"}</h1>
              <p className="mt-2 rounded-2xl bg-stone-50 p-4 text-[15px] leading-7 dark:bg-black/20">{detail.referenceText}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/?repeat=${detail.id}`}
                  className="rounded-2xl bg-stone-900 px-4 py-2 text-sm font-bold text-white dark:bg-white dark:text-stone-900"
                >
                  Record again
                </Link>
                {audioUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = audioUrl;
                      a.download = `clearspeak-${detail.id}.wav`;
                      a.click();
                    }}
                    className="rounded-2xl border border-stone-300 px-4 py-2 text-sm font-semibold"
                  >
                    Download recording (.wav)
                  </button>
                )}
                {detail.evaluation && (
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob(
                        [JSON.stringify({ version: 1, attempt: detail.id, evaluation: detail.evaluation, config: detail.assessmentConfig }, null, 2)],
                        { type: "application/json" },
                      );
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `clearspeak-${detail.id}.json`;
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 5000);
                    }}
                    className="rounded-2xl border border-stone-300 px-4 py-2 text-sm font-semibold"
                  >
                    Download evaluation (.json)
                  </button>
                )}
                {!confirming ? (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="rounded-2xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700"
                  >
                    Delete attempt
                  </button>
                ) : (
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    Delete this recording and its evaluation?
                    <button
                      type="button"
                      onClick={() => void deleteAttemptRequest(id).then(() => {
                        setAnnounce("Recording deleted.");
                        router.push("/history");
                      })}
                      className="rounded-xl bg-red-700 px-3 py-1.5 font-bold text-white"
                    >
                      Delete
                    </button>
                    <button type="button" onClick={() => setConfirming(false)} className="underline">
                      Keep
                    </button>
                  </span>
                )}
              </div>
              {detail.evaluationState === "pending" && (
                <p className="mt-3 text-sm">
                  Needs evaluation.{" "}
                  <Link href={`/?retry-eval=${detail.id}`} className="font-semibold text-[#2563eb]">
                    Retry evaluation
                  </Link>
                </p>
              )}
              {detail.evaluationState === "failed" && (
                <p className="mt-3 text-sm">
                  Evaluation failed{detail.failureMessage ? `: ${detail.failureMessage}` : "."}{" "}
                  <Link href={`/?retry-eval=${detail.id}`} className="font-semibold text-[#2563eb]">
                    Retry evaluation
                  </Link>
                </p>
              )}
            </div>

            {audioError ? (
              <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm">
                {audioError} <button type="button" onClick={() => void loadAudio()} className="underline">Retry</button>
              </p>
            ) : audioUrl ? (
              <LastRecordingPlayer audioUrl={audioUrl} label="Saved recording" />
            ) : null}

            {detail.evaluation ? (
              <>
                <ResultsView
                  result={detail.evaluation}
                  audioUrl={null}
                  onRetry={() => router.push(`/?repeat=${detail.id}`)}
                  onNewText={() => router.push("/")}
                  hideAudio
                />
                <ComparisonView detail={detail} />
              </>
            ) : (
              <AttemptAudio attemptId={detail.id} label="Saved audio" />
            )}
          </>
        )}
      </main>
    </div>
  );
}
