"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AccessGate from "@/components/access-gate";
import AnalyzingState from "@/components/analyzing-state";
import PracticeEditor from "@/components/practice-editor";
import RecordingSession from "@/components/recording-session";
import ResultsView from "@/components/results-view";
import LastRecordingPlayer from "@/components/last-recording-player";
import { usePcmRecorder } from "@/hooks/use-pcm-recorder";
import { MIN_RECORDING_MS } from "@/lib/audio/wav";
import { assessWavFile, classifyAssessmentError, fetchSpeechToken } from "@/lib/azure/pronunciation";
import {
  customTextIdentity,
  DEFAULT_PASSAGE_FILTERS,
  passageIdentity,
  type PassageFilterState,
  type PracticePassage,
} from "@/lib/practice-content";
import { normalizeText } from "@/lib/text";
import type { AssessmentFailure, AssessmentResult, PracticePhase } from "@/lib/types";

type Props = {
  accessRequired: boolean;
};

function failureFor(kind: AssessmentFailure["kind"], message: string, nextAction: string): AssessmentFailure {
  return { kind, message, nextAction };
}

export default function ClearSpeakApp({ accessRequired }: Props) {
  const [unlocked, setUnlocked] = useState(!accessRequired);
  const [accessCode, setAccessCode] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    try {
      return sessionStorage.getItem("clearspeak-access") ?? undefined;
    } catch {
      return undefined;
    }
  });
  const [phase, setPhase] = useState<PracticePhase>(accessRequired ? "locked" : "editing");
  const [draft, setDraft] = useState("");
  const [passage, setPassage] = useState("");
  const [selectedPassage, setSelectedPassage] = useState<PracticePassage | null>(null);
  const [libraryFilters, setLibraryFilters] =
    useState<PassageFilterState>(DEFAULT_PASSAGE_FILTERS);
  const [activePracticeItem, setActivePracticeItem] = useState<
    | ({ kind: "library"; id: string; version: number } & { title: string })
    | { kind: "custom"; hash: string }
    | null
  >(null);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [failure, setFailure] = useState<AssessmentFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [assessing, setAssessing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  /** Synchronous guard so a double-click on Finish submits analysis exactly once. */
  const submitGuardRef = useRef(false);

  const handleAutoStop = useCallback(() => {
    if (submitGuardRef.current) return;
    submitGuardRef.current = true;
    setNotice("The 30-second limit was reached, so your recording was finished automatically.");
    setPhase("preparing-audio");
  }, []);

  const recorder = usePcmRecorder({ onAutoStop: handleAutoStop });

  // Route change / unmount: abort in-flight assessment and stop sample playback.
  useEffect(() => {
    const controller = abortRef;
    return () => {
      controller.current?.abort();
      try {
        if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const unlock = useCallback(
    (code: string) => {
      setAccessCode(code);
      setUnlocked(true);
      setPhase("editing");
      setFailure(null);
    },
    [],
  );

  const beginRecording = useCallback(
    (normalized: string) => {
      setNotice(null);
      setFailure(null);
      setResult(null);
      setPassage(normalized);
      setActivePracticeItem(
        selectedPassage?.text === normalized
          ? { ...passageIdentity(selectedPassage), title: selectedPassage.title }
          : customTextIdentity(normalized),
      );
      setPhase("requesting-microphone");
      void recorder.start().then((outcome) => {
        if (outcome.ok) {
          setPhase("recording");
          return;
        }
        setFailure(
          failureFor(
            outcome.unsupported ? "unsupported-browser" : "permission-denied",
            outcome.message,
            outcome.unsupported
              ? "Use a recent Chrome, Edge, or Safari that supports AudioWorklet recording."
              : "Allow microphone access in your browser and try again.",
          ),
        );
        setPhase("recoverable-error");
      });
    },
    [recorder, selectedPassage],
  );

  const changeDraft = useCallback(
    (value: string) => {
      setDraft(value);
      if (selectedPassage && normalizeText(value) !== selectedPassage.text) setSelectedPassage(null);
    },
    [selectedPassage],
  );

  const selectPassage = useCallback((selected: PracticePassage) => {
    setSelectedPassage(selected);
    setDraft(selected.text);
    setFailure(null);
    setNotice(null);
  }, []);

  const finishRecording = useCallback(() => {
    if (submitGuardRef.current) return;
    submitGuardRef.current = true;
    setPhase("preparing-audio");
    void recorder.finish(false);
  }, [recorder]);

  const cancelRecording = useCallback(() => {
    abortRef.current?.abort();
    setAssessing(false);
    submitGuardRef.current = false;
    recorder.cancel();
    setPhase("editing");
    setNotice(null);
    setFailure(null);
  }, [recorder]);

  // When WAV is ready after Finish, validate length then run token + assessment.
  useEffect(() => {
    if (phase !== "preparing-audio" || !recorder.finished) return;
    const run = async () => {
      const { blob, durationMs } = recorder.finished!;
      if (durationMs < MIN_RECORDING_MS) {
        setFailure(
          failureFor(
            "too-short",
            "That recording was too short to assess (under a second).",
            "Press Start recording and read the full passage aloud, then finish.",
          ),
        );
        setPhase("recoverable-error");
        return;
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setFailure(
          failureFor(
            "offline",
            "You appear to be offline.",
            "Reconnect to the internet and try again — assessment needs to reach Azure.",
          ),
        );
        setPhase("recoverable-error");
        return;
      }
      setPhase("requesting-token");
      setAssessing(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const token = await fetchSpeechToken(accessCode);
        if (controller.signal.aborted) return;
        // Token is short-lived; if it somehow expired, fetchSpeechToken would fail and we surface retry.
        setPhase("assessing");
        const assessment = await assessWavFile({
          wavBlob: blob,
          referenceText: passage,
          token,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setResult(assessment);
        setFailure(null);
        setPhase("success");
      } catch (err) {
        if ((err as { status?: number }).status === 401) {
          try {
            sessionStorage.removeItem("clearspeak-access");
          } catch {
            /* ignore */
          }
          setAccessCode(undefined);
          if (accessRequired) {
            setUnlocked(false);
            setPhase("locked");
          } else {
            setPhase("recoverable-error");
          }
          setFailure(
            failureFor(
              "auth",
              "Your access code was not accepted.",
              "Unlock the app again with your personal access code.",
            ),
          );
          return;
        }
        const withFailure = err as Error & { assessmentFailure?: AssessmentFailure };
        if (withFailure.assessmentFailure) {
          setFailure(withFailure.assessmentFailure);
        } else {
          setFailure(classifyAssessmentError(err));
        }
        setPhase("recoverable-error");
      } finally {
        setAssessing(false);
      }
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, recorder.finished]);

  const retrySame = useCallback(() => {
    setResult(null);
    setFailure(null);
    setNotice(null);
    submitGuardRef.current = false;
    setDraft(passage);
    setPhase("editing");
  }, [passage]);

  const newText = useCallback(() => {
    setResult(null);
    setFailure(null);
    setNotice(null);
    submitGuardRef.current = false;
    setDraft("");
    setPassage("");
    setSelectedPassage(null);
    setActivePracticeItem(null);
    setPhase("editing");
  }, []);

  const backToEditing = useCallback(() => {
    setFailure(null);
    submitGuardRef.current = false;
    setPhase("editing");
  }, []);

  if (accessRequired && !unlocked) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] dark:bg-stone-950">
        <Header />
        <AccessGate onUnlock={unlock} />
        {failure?.kind === "auth" && (
          <p role="alert" className="mx-auto max-w-md px-4 pb-8 text-center text-sm text-red-700 dark:text-red-300">
            {failure.message} {failure.nextAction}
          </p>
        )}
      </div>
    );
  }

  const analyzingStep = phase === "requesting-token" ? 1 : phase === "assessing" ? 2 : 0;
  const stepIndex =
    phase === "success" ? 3 : phase === "recording" || phase === "preparing-audio" || phase === "requesting-token" || phase === "assessing" ? 2 : 1;

  return (
    <div className="min-h-screen bg-[#f8f7f4] text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <Header />
      <main className="mx-auto w-full max-w-3xl px-4 pb-20 sm:px-6">
        <div className="rise-in pt-8 text-center sm:pt-12">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#2563eb]">
            Private pronunciation practice
          </p>
          <h1
            className="mx-auto mt-3 max-w-xl text-balance text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Read it. Hear yourself. Improve.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-sm leading-6 text-stone-600 sm:text-base dark:text-stone-400">
            Paste a short passage, read it aloud, and get sound-by-sound feedback on your English
            pronunciation.
          </p>
          <Stepper current={stepIndex} />
        </div>

        {notice && (
          <div role="status" className="rise-in mt-6 flex items-start gap-3 rounded-2xl border border-[#2563eb]/25 bg-blue-50/80 px-4 py-3 text-sm leading-6 shadow-[var(--shadow-card)] dark:bg-blue-950/50">
            <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2563eb] text-[11px] font-bold text-white">i</span>
            <span>{notice}</span>
          </div>
        )}

        <div className="mt-6 space-y-5">
          {(phase === "editing" || phase === "recoverable-error") && (
            <div className="rise-in rise-in-1">
            <PracticeEditor
              draft={draft}
              onDraftChange={changeDraft}
              onStart={beginRecording}
              disabled={assessing}
              selectedPassage={selectedPassage}
              onSelectPassage={selectPassage}
              libraryFilters={libraryFilters}
              onLibraryFiltersChange={setLibraryFilters}
            />
            </div>
          )}

          {(phase === "editing" || phase === "recoverable-error") && recorder.finished?.url && (
            <div className="rise-in rise-in-2">
              <LastRecordingPlayer audioUrl={recorder.finished.url} />
            </div>
          )}

          {phase === "requesting-microphone" && recorder.status !== "recording" && !failure && (
            <div className="rise-in rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/5">
              <span aria-hidden="true" className="mx-auto block h-8 w-8 animate-spin rounded-full border-[3px] border-[#2563eb] border-t-transparent" />
              <p className="mt-3 text-base font-semibold">Requesting microphone access…</p>
              <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Your browser should show a permission prompt.</p>
            </div>
          )}

          {phase === "recording" && (
            <div className="rise-in">
            <RecordingSession
              passage={passage}
              practiceLabel={activePracticeItem?.kind === "library" ? activePracticeItem.title : "Custom text"}
              elapsedMs={recorder.elapsedMs}
              level={recorder.level}
              onFinish={finishRecording}
              onCancel={cancelRecording}
              busy={recorder.finishing}
            />
            </div>
          )}

          {phase === "preparing-audio" && !recorder.finished && (
            <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/5">
              <p className="text-base font-medium">Preparing your audio…</p>
            </div>
          )}

          {(phase === "requesting-token" || phase === "assessing") && (
            <div className="rise-in">
              <AnalyzingState step={analyzingStep} />
            </div>
          )}

          {phase === "recoverable-error" && failure && (
            <div className="rise-in">
              <ErrorCard failure={failure} onRetry={backToEditing} onCancel={cancelRecording} />
            </div>
          )}

          {phase === "success" && result && (
            <div className="rise-in">
            <ResultsView
              result={result}
              audioUrl={recorder.finished?.url ?? null}
              onRetry={retrySame}
              onNewText={newText}
            />
            </div>
          )}

          {phase === "success" && result && recorder.autoStopped && (
            <p className="text-center text-xs text-stone-500 dark:text-stone-400">
              This attempt used the full 30 seconds.
            </p>
          )}
        </div>

        <footer className="mt-12 border-t border-stone-200 pt-5 text-center text-xs leading-5 text-stone-500 dark:border-white/10 dark:text-stone-400">
          <p className="font-semibold text-stone-600 dark:text-stone-300">Private by design</p>
          <p className="mt-1">Your recording stays in this browser until you analyze it.</p>
          <p>When you analyze, the audio is sent directly to Azure Speech and is not stored by ClearSpeak.</p>
        </footer>
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-[#f8f7f4]/85 backdrop-blur-md dark:border-white/10 dark:bg-stone-950/80">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
        <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-stone-900 text-white dark:bg-white dark:text-stone-900">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="6" y="1.5" width="4" height="8" rx="2" fill="currentColor" />
            <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <line x1="8" y1="12" x2="8" y2="14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <p className="text-[17px] font-extrabold tracking-tight">
          ClearSpeak
        </p>
        <span className="rounded-full bg-[#2563eb]/10 px-2.5 py-0.5 text-xs font-semibold text-[#1d4ed8] dark:text-blue-200">
          English · US
        </span>
        <span className="ml-auto hidden items-center gap-1.5 text-xs text-stone-500 sm:flex dark:text-stone-400">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
          Private practice · nothing is stored
        </span>
      </div>
    </header>
  );
}

function Stepper({ current }: { current: number }) {
  const steps = ["Practice", "Record", "Review"];
  return (
    <ol aria-label="Practice progress" className="mx-auto mt-6 flex max-w-md items-center justify-center gap-2">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold tabular-nums transition-colors ${
                  done
                    ? "bg-emerald-700 text-white"
                    : active
                      ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900"
                      : "bg-stone-200 text-stone-500 dark:bg-white/10 dark:text-stone-400"
                }`}
              >
                {done ? "✓" : n}
              </span>
              <span className={`text-xs font-semibold ${active ? "" : "text-stone-500 dark:text-stone-400"}`}>
                {label}
                {active && <span className="sr-only"> (current step)</span>}
              </span>
            </span>
            {n < steps.length && (
              <span aria-hidden="true" className={`mx-1 h-px w-6 sm:w-10 ${n < current ? "bg-emerald-700" : "bg-stone-300 dark:bg-white/15"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ErrorCard({
  failure,
  onRetry,
  onCancel,
}: {
  failure: AssessmentFailure;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const titles: Record<AssessmentFailure["kind"], string> = {
    "permission-denied": "Microphone blocked",
    "unsupported-browser": "Browser not supported",
    "no-speech": "No speech detected",
    auth: "Access needed",
    quota: "Speech service is busy",
    network: "Connection problem",
    offline: "You are offline",
    timeout: "Assessment timed out",
    "too-short": "Recording too short",
    cancelled: "Cancelled",
    "invalid-credentials": "Speech credentials rejected",
    generic: "Something went wrong",
  };
  return (
    <div role="alert" className="rounded-2xl border border-red-700/20 bg-red-50/80 p-5 shadow-[var(--shadow-card)] sm:p-6 dark:border-red-400/20 dark:bg-red-950/40">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-700/10 text-base">!</span>
        <div>
          <h3 className="text-base font-bold tracking-tight">{titles[failure.kind]}</h3>
          <p className="mt-1 text-sm leading-6 text-stone-700 dark:text-stone-200">{failure.message}</p>
          <p className="mt-1 text-sm font-medium">{failure.nextAction}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-700 active:scale-[0.99] dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium transition hover:bg-stone-100 active:scale-[0.99] dark:border-white/15 dark:bg-transparent dark:hover:bg-white/10"
        >
          Back to editor
        </button>
      </div>
    </div>
  );
}
