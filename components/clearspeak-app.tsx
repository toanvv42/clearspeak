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
      <div className="min-h-screen">
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

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto w-full max-w-3xl px-4 pb-20 sm:px-6">
        <div className="pt-6 text-center sm:pt-10">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            Read it. Hear yourself. Improve.
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 opacity-75 sm:text-base">
            Paste a short passage, read it aloud, and get sound-by-sound feedback on your English
            pronunciation.
          </p>
        </div>

        {notice && (
          <div role="status" className="mt-4 rounded-xl border border-[#2563eb]/30 bg-blue-50 px-4 py-3 text-sm dark:bg-blue-950/60">
            {notice}
          </div>
        )}

        <div className="mt-6 space-y-5">
          {(phase === "editing" || phase === "recoverable-error") && (
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
          )}

          {(phase === "editing" || phase === "recoverable-error") && recorder.finished?.url && (
            <LastRecordingPlayer audioUrl={recorder.finished.url} />
          )}

          {phase === "requesting-microphone" && recorder.status !== "recording" && !failure && (
            <div className="rounded-2xl border border-[#e5ddcb] bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-white/5">
              <p className="text-base font-medium">Requesting microphone access…</p>
              <p className="mt-1 text-sm opacity-70">Your browser should show a permission prompt.</p>
            </div>
          )}

          {phase === "recording" && (
            <RecordingSession
              passage={passage}
              practiceLabel={activePracticeItem?.kind === "library" ? activePracticeItem.title : "Custom text"}
              elapsedMs={recorder.elapsedMs}
              level={recorder.level}
              onFinish={finishRecording}
              onCancel={cancelRecording}
              busy={recorder.finishing}
            />
          )}

          {phase === "preparing-audio" && !recorder.finished && (
            <div className="rounded-2xl border border-[#e5ddcb] bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-white/5">
              <p className="text-base font-medium">Preparing your audio…</p>
            </div>
          )}

          {(phase === "requesting-token" || phase === "assessing") && (
            <AnalyzingState step={analyzingStep} />
          )}

          {phase === "recoverable-error" && failure && (
            <ErrorCard failure={failure} onRetry={backToEditing} onCancel={cancelRecording} />
          )}

          {phase === "success" && result && (
            <ResultsView
              result={result}
              audioUrl={recorder.finished?.url ?? null}
              onRetry={retrySame}
              onNewText={newText}
            />
          )}

          {phase === "success" && result && recorder.autoStopped && (
            <p className="text-center text-xs opacity-60">
              This attempt used the full 30 seconds.
            </p>
          )}
        </div>

        <footer className="mt-10 border-t border-black/10 pt-4 text-center text-xs leading-5 opacity-70 dark:border-white/10">
          <p>Your recording stays in this browser until you analyze it.</p>
          <p>When you analyze, the audio is sent directly to Azure Speech and is not stored by ClearSpeak.</p>
        </footer>
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-black/10 bg-white/70 backdrop-blur dark:border-white/10 dark:bg-black/30">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
        <p className="text-lg font-black tracking-tight">
          ClearSpeak
        </p>
        <span className="rounded-full bg-[#2563eb]/10 px-2.5 py-0.5 text-xs font-semibold text-[#1d4ed8] dark:text-blue-200">
          English · US
        </span>
        <span className="ml-auto hidden text-xs opacity-60 sm:block">
          Private practice · nothing is stored
        </span>
      </div>
    </header>
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
    <div role="alert" className="rounded-2xl border border-red-700/25 bg-red-50 p-5 dark:bg-red-950/50">
      <h3 className="text-base font-bold">{titles[failure.kind]}</h3>
      <p className="mt-1 text-sm">{failure.message}</p>
      <p className="mt-1 text-sm font-medium">{failure.nextAction}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-xl bg-[#2563eb] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-black/15 px-5 py-2.5 text-sm font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
        >
          Back to editor
        </button>
      </div>
    </div>
  );
}
