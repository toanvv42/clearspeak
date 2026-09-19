"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AccessGate from "@/components/access-gate";
import AnalyzingState from "@/components/analyzing-state";
import AppHeader from "@/components/app-header";
import ComparisonView from "@/components/comparison-view";
import { ScoreDelta } from "@/components/attempt-audio";
import PassageLibrary from "@/components/passage-library";
import PracticeEditor from "@/components/practice-editor";
import RecordingSession from "@/components/recording-session";
import ResultsView from "@/components/results-view";
import LastRecordingPlayer from "@/components/last-recording-player";
import SaveStatus from "@/components/save-status";
import { usePcmRecorder } from "@/hooks/use-pcm-recorder";
import { useAttemptSave } from "@/hooks/use-attempt-save";
import { MIN_RECORDING_MS } from "@/lib/audio/wav";
import { assessWavFile, classifyAssessmentError, fetchSpeechToken } from "@/lib/azure/pronunciation";
import {
  customTextIdentity,
  DEFAULT_PASSAGE_FILTERS,
  getPassageById,
  passageIdentity,
  type PassageFilterState,
  type PracticePassage,
} from "@/lib/practice-content";
import { fetchAttemptAudioBlob, fetchAttemptDetail, fetchAttemptList } from "@/lib/history/client";
import { clearAccessCode, getAccessCode as readStoredCode, hasAccessCode } from "@/lib/access-code";
import { HISTORY_SCHEMA_VERSION, type AttemptDetail, type AttemptSummary } from "@/lib/history/types";
import { normalizeText } from "@/lib/text";
import type { AssessmentFailure, AssessmentResult, PracticePhase } from "@/lib/types";

type Props = {
  accessRequired: boolean;
};

function failureFor(kind: AssessmentFailure["kind"], message: string, nextAction: string): AssessmentFailure {
  return { kind, message, nextAction };
}

function newAttemptId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.floor(Math.random() * 16);
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

export default function ClearSpeakApp({ accessRequired }: Props) {
  const [unlocked, setUnlocked] = useState(() => !accessRequired || hasAccessCode());
  const [accessCode, setAccessCode] = useState<string | undefined>(() => readStoredCode());
  const [phase, setPhase] = useState<PracticePhase>(() => {
    if (!accessRequired) return "editing";
    return hasAccessCode() ? "editing" : "locked";
  });
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
  const [previousInSession, setPreviousInSession] = useState<{
    result: AssessmentResult;
    audioUrl: string | null;
    passage: string;
  } | null>(null);
  const [failure, setFailure] = useState<AssessmentFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [latest, setLatest] = useState<AttemptSummary | null>(null);
  const [savedDetail, setSavedDetail] = useState<AttemptDetail | null>(null);
  const [retryingEval, setRetryingEval] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  /** Synchronous guard so a double-click on Finish submits analysis exactly once. */
  const submitGuardRef = useRef(false);
  const attemptIdRef = useRef<string | null>(null);
  const evalIdRef = useRef<string | null>(null);
  const attemptMetaRef = useRef<Record<string, unknown> | null>(null);
  const attemptBlobRef = useRef<Blob | null>(null);

  const saver = useAttemptSave();

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

  // Desktop sidebar: single library instance per viewport avoids duplicate
  // accessible names in tests (jsdom has no matchMedia, so it stays mobile).
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  // Continue-practicing card: latest server attempt (never blocks the editor).
  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    void fetchAttemptList({ limit: 1 })
      .then((res) => {
        if (!cancelled) setLatest(res.items[0] ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [unlocked, phase]);

  // Deep links: ?repeat=<id> preloads exact saved text; ?retry-eval=<id> re-evaluates saved WAV.
  useEffect(() => {
    if (!unlocked) return;
    const params = new URLSearchParams(window.location.search);
    const repeatId = params.get("repeat");
    const retryId = params.get("retry-eval");
    if (repeatId) {
      void fetchAttemptDetail(repeatId)
        .then((d) => {
          setDraft(d.referenceText);
          setPassage("");
          const lib =
            d.source.kind === "library" ? getPassageById(d.source.id, d.source.version) : undefined;
          setSelectedPassage(lib ?? null);
          setResult(null);
          setFailure(null);
          setPhase("editing");
          window.history.replaceState(null, "", "/");
        })
        .catch(() => {});
    } else if (retryId) {
      void (async () => {
        try {
          const d = await fetchAttemptDetail(retryId);
          setRetryingEval(true);
          setPassage(d.referenceText);
          setActivePracticeItem(
            d.source.kind === "library"
              ? { kind: "library", id: d.source.id, version: d.source.version, title: d.title ?? "Saved passage" }
              : { kind: "custom", hash: d.source.hash },
          );
          const blob = await fetchAttemptAudioBlob(retryId);
          attemptIdRef.current = retryId;
          attemptBlobRef.current = blob;
          const token = await fetchSpeechToken(accessCode);
          const controller = new AbortController();
          abortRef.current = controller;
          setPhase("assessing");
          setAssessing(true);
          const assessment = await assessWavFile({ wavBlob: blob, referenceText: d.referenceText, token, signal: controller.signal });
          setResult(assessment);
          setPhase("success");
          const evaluationId = newAttemptId();
          evalIdRef.current = evaluationId;
          await saver.saveEvaluationPayload(
            retryId,
            {
              evaluationId,
              expectedRevision: d.revision,
              evaluatedAt: new Date().toISOString(),
              assessmentConfig: {
                provider: "azure",
                sdkVersion: "1.51.0",
                locale: "en-US",
                enableProsody: token.enableProsody,
                phonemeAlphabet: "IPA",
                granularity: "phoneme",
                gradingSystem: "hundred-mark",
                miscue: true,
                parserVersion: 1,
              },
              result: assessment,
            },
            false,
          );
          window.history.replaceState(null, "", "/");
        } catch (err) {
          setFailure(classifyAssessmentError(err));
          setPhase("recoverable-error");
        } finally {
          setAssessing(false);
          setRetryingEval(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  const unlock = useCallback(
    (code: string) => {
      setAccessCode(code);
      setUnlocked(true);
      setPhase("editing");
      setFailure(null);
      void saver.drainAll();
    },
    [saver],
  );

  const beginRecording = useCallback(
    (normalized: string) => {
      try {
        if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
      setNotice(null);
      setFailure(null);
      setResult(null);
      setSavedDetail(null);
      saver.reset();
      attemptIdRef.current = newAttemptId();
      evalIdRef.current = null;
      attemptMetaRef.current = null;
      attemptBlobRef.current = null;
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
    [recorder, selectedPassage, saver],
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
    attemptIdRef.current = null;
    recorder.cancel();
    setPhase("editing");
    setNotice(null);
    setFailure(null);
  }, [recorder]);

  // When WAV is ready after Finish, save it then run token + assessment in parallel.
  useEffect(() => {
    if (phase !== "preparing-audio" || !recorder.finished) return;
    const run = async () => {
      const { blob, durationMs } = recorder.finished!;
      // Immutable snapshot: the recorder may revoke its object URL on next start.
      const wavSnapshot = blob.slice(0, blob.size, "audio/wav");
      attemptBlobRef.current = wavSnapshot;
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
      const attemptId = attemptIdRef.current ?? newAttemptId();
      attemptIdRef.current = attemptId;
      const stopReason = recorder.autoStopped ? "limit" : "manual";
      const item = activePracticeItem;
      const metadata: Record<string, unknown> = {
        schemaVersion: HISTORY_SCHEMA_VERSION,
        recordedAt: new Date().toISOString(),
        durationMs: Math.round(durationMs),
        stopReason,
        referenceText: passage,
        title: item?.kind === "library" ? item.title : passage.slice(0, 60),
        level: selectedPassage?.band ?? null,
        source:
          item?.kind === "library"
            ? { kind: "library", id: item.id, version: item.version }
            : customTextIdentity(passage),
        scope: "passage",
        locale: "en-US",
      };
      attemptMetaRef.current = metadata;
      // Queue the recording before any connectivity check: an offline take
      // must survive reload in IndexedDB as "Saved on this device".
      const savePromise = saver.beginTake(attemptId, metadata, wavSnapshot);
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setFailure(
          failureFor(
            "offline",
            "You appear to be offline. Your recording is kept on this device and will sync when you reconnect.",
            "Reconnect, then use Retry save — assessment needs to reach Azure.",
          ),
        );
        setPhase("recoverable-error");
        return;
      }
      setPhase("requesting-token");
      setAssessing(true);
      const controller = new AbortController();
      abortRef.current = controller;
      let token: Awaited<ReturnType<typeof fetchSpeechToken>>;
      try {
        token = await fetchSpeechToken(accessCode);
      } catch (err) {
        await savePromise.catch(() => {});
        if ((err as { status?: number }).status === 401) {
          clearAccessCode();
          setAccessCode(undefined);
          // The finished take is already queued on this device; unlocking
          // again syncs it automatically. Never lose the user's work here.
          setNotice("Your recording is kept on this device. Unlock again to sync it to history.");
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
        const tokenFailure = withFailure.assessmentFailure ?? classifyAssessmentError(err);
        setFailure(tokenFailure);
        setPhase("recoverable-error");
        // Persist the failure so the take shows as failed (not pending) after
        // reload. No Azure assessment ran; the config snapshot records defaults.
        try {
          await savePromise.catch(() => {});
          const evaluationId = newAttemptId();
          evalIdRef.current = evaluationId;
          await saver.saveEvaluationPayload(
            attemptId,
            {
              evaluationId,
              expectedRevision: 0,
              evaluatedAt: new Date().toISOString(),
              assessmentConfig: {
                provider: "azure",
                sdkVersion: "1.51.0",
                locale: "en-US",
                enableProsody: false,
                phonemeAlphabet: "IPA",
                granularity: "phoneme",
                gradingSystem: "hundred-mark",
                miscue: true,
                parserVersion: 1,
              },
              failure: { kind: tokenFailure.kind, message: tokenFailure.message.slice(0, 500) },
            },
            true,
          );
        } catch {
          saver.markEvalFailed();
        }
        return;
      }
      if (controller.signal.aborted) return;
      setPhase("assessing");
      try {
        const assessment = await assessWavFile({
          wavBlob: wavSnapshot,
          referenceText: passage,
          token,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        // Show scores immediately; history write must not hide feedback.
        setResult(assessment);
        setFailure(null);
        setPhase("success");
        const evaluationId = newAttemptId();
        evalIdRef.current = evaluationId;
        await savePromise.catch(() => {});
        await saver.saveEvaluationPayload(
          attemptId,
          {
            evaluationId,
            expectedRevision: 0,
            evaluatedAt: new Date().toISOString(),
            assessmentConfig: {
              provider: "azure",
              sdkVersion: "1.51.0",
              locale: "en-US",
              enableProsody: token.enableProsody,
              phonemeAlphabet: "IPA",
              granularity: "phoneme",
              gradingSystem: "hundred-mark",
              miscue: true,
              parserVersion: 1,
            },
            result: assessment,
          },
          false,
        );
        // Refresh comparison data without another Azure call.
        void fetchAttemptDetail(attemptId)
          .then(setSavedDetail)
          .catch(() => {});
      } catch (err) {
        if ((err as Error).message === "Assessment was cancelled.") return;
        const withFailure = err as Error & { assessmentFailure?: AssessmentFailure };
        const af = withFailure.assessmentFailure ?? classifyAssessmentError(err);
        setFailure(af);
        setPhase("recoverable-error");
        // Persist the failure state so the WAV stays retryable without a mic.
        try {
          await savePromise.catch(() => {});
          const evaluationId = newAttemptId();
          evalIdRef.current = evaluationId;
          await saver.saveEvaluationPayload(
            attemptId,
            {
              evaluationId,
              expectedRevision: 0,
              evaluatedAt: new Date().toISOString(),
              assessmentConfig: {
                provider: "azure",
                sdkVersion: "1.51.0",
                locale: "en-US",
                enableProsody: token.enableProsody,
                phonemeAlphabet: "IPA",
                granularity: "phoneme",
                gradingSystem: "hundred-mark",
                miscue: true,
                parserVersion: 1,
              },
              failure: { kind: af.kind, message: af.message.slice(0, 500) },
            },
            true,
          );
        } catch {
          saver.markEvalFailed();
        }
      } finally {
        setAssessing(false);
      }
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, recorder.finished]);

  const recordAgain = useCallback(() => {
    if (result) {
      setPreviousInSession({
        result,
        audioUrl: recorder.finished?.url ?? null,
        passage,
      });
    }
    setResult(null);
    setFailure(null);
    setNotice(null);
    setSavedDetail(null);
    saver.reset();
    submitGuardRef.current = false;
    attemptIdRef.current = null;
    setDraft(passage);
    setPhase("editing");
    // Preload exact text and wait for the user to start the microphone.
    requestAnimationFrame(() => {
      document.getElementById("practice-text")?.focus();
    });
  }, [passage, saver, result, recorder.finished]);

  const newText = useCallback(() => {
    setResult(null);
    setPreviousInSession(null);
    setFailure(null);
    setNotice(null);
    setSavedDetail(null);
    saver.reset();
    submitGuardRef.current = false;
    attemptIdRef.current = null;
    setDraft("");
    setPassage("");
    setSelectedPassage(null);
    setActivePracticeItem(null);
    setPhase("editing");
  }, [saver]);

  const backToEditing = useCallback(() => {
    setFailure(null);
    submitGuardRef.current = false;
    setPhase("editing");
  }, []);

  const downloadCurrentWav = useCallback(() => {
    const blob = attemptBlobRef.current;
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clearspeak-${attemptIdRef.current ?? "recording"}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, []);

  if (accessRequired && !unlocked) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] dark:bg-stone-950">
        <AppHeader />
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
  const isEditing = phase === "editing" || phase === "recoverable-error";
  const showSidebar = isEditing && isDesktop;

  const continueCard =
    isEditing && latest && !result ? (
      <div className="rise-in mx-auto max-w-3xl rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-stone-400">Continue practicing</p>
            <p className="truncate text-sm font-bold">
              {latest.title ?? latest.referenceText.slice(0, 60)} ·{" "}
              {new Date(latest.recordedAt).toLocaleDateString()}
              {typeof latest.pronunciationScore === "number" ? ` · score ${latest.pronunciationScore}` : ""}
            </p>
          </div>
          <Link
            href={`/history/${latest.id}`}
            className="rounded-full border border-stone-300 px-3 py-1.5 text-[13px] font-semibold"
          >
            View result
          </Link>
          <Link
            href={`/?repeat=${latest.id}`}
            className="rounded-full bg-stone-900 px-3 py-1.5 text-[13px] font-bold text-white dark:bg-white dark:text-stone-900"
          >
            Record again
          </Link>
        </div>
      </div>
    ) : null;

  const resultsHeader =
    phase === "success" && result ? (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <SaveStatus state={saver.state} onRetry={() => void saver.retry()} onDownload={downloadCurrentWav} />
          {saver.serverId && (
            <Link href={`/history/${saver.serverId}`} className="text-[13px] font-semibold text-[#2563eb]">
              View in history
            </Link>
          )}
        </div>
        {savedDetail?.previousSummary && <ComparisonView detail={savedDetail} />}
      </div>
    ) : null;

  const editorPanel = (
    <div className="rise-in rise-in-1">
      <PracticeEditor
        draft={draft}
        onDraftChange={changeDraft}
        onStart={beginRecording}
        disabled={assessing || retryingEval}
        selectedPassage={selectedPassage}
        onSelectPassage={selectPassage}
        libraryFilters={libraryFilters}
        onLibraryFiltersChange={setLibraryFilters}
        hideLibraryBrowser={showSidebar}
      />
      <p className="mt-2 text-center text-xs text-stone-500 sm:text-left dark:text-stone-400">
        Finished recordings and feedback are saved automatically.
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8f7f4] text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        {notice && (
          <div role="status" className="rise-in mx-auto mt-6 flex max-w-3xl items-start gap-3 rounded-2xl border border-[#2563eb]/25 bg-blue-50/80 px-4 py-3 text-sm leading-6 shadow-[var(--shadow-card)] dark:bg-blue-950/50">
            <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2563eb] text-[11px] font-bold text-white">i</span>
            <span>{notice}</span>
          </div>
        )}

        <div className={showSidebar ? "mt-6 space-y-5" : "mx-auto mt-6 max-w-3xl space-y-5"}>
          {showSidebar ? (
            <div className="grid grid-cols-[370px_minmax(0,1fr)] items-start gap-6">
              <aside aria-label="Sample library sidebar" className="sticky top-[68px] self-start">
                <PassageLibrary
                  selectedId={selectedPassage?.id}
                  filters={libraryFilters}
                  onFiltersChange={setLibraryFilters}
                  onSelect={selectPassage}
                  className="mt-0"
                />
                <p className="mt-2 px-1 text-xs leading-5 text-stone-500 dark:text-stone-400">Choosing a sample fills the editor instantly.</p>
              </aside>
              <div className="min-w-0 space-y-5">
                {continueCard}
                {editorPanel}
                {recorder.finished?.url && (
                  <div className="rise-in rise-in-2">
                    <LastRecordingPlayer audioUrl={recorder.finished.url} />
                  </div>
                )}
                {phase === "recoverable-error" && failure && (
                  <div className="rise-in">
                    <ErrorCard failure={failure} onRetry={backToEditing} onCancel={cancelRecording} />
                  </div>
                )}
              </div>
            </div>
          ) : (
          <>
          {isEditing && continueCard}
          {isEditing && editorPanel}

          {isEditing && recorder.finished?.url && (
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
            <div className="rise-in space-y-3">
              <SaveStatus state={saver.state} onRetry={() => void saver.retry()} onDownload={downloadCurrentWav} />
              <ErrorCard failure={failure} onRetry={backToEditing} onCancel={cancelRecording} />
            </div>
          )}

          {phase === "success" && result && (
            <div className="rise-in space-y-4">
              <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
                <p className="text-sm font-bold">{activePracticeItem?.kind === "library" ? activePracticeItem.title : "Custom text"}</p>
                <p className="text-[13px] text-stone-500">
                  {new Date().toLocaleString()} · {Math.round((recorder.finished?.durationMs ?? 0) / 1000)}s
                </p>
                <div className="mt-2">
                  <SaveStatus state={saver.state} onRetry={() => void saver.retry()} onDownload={downloadCurrentWav} />
                </div>
              </div>
              {recorder.finished?.url && <LastRecordingPlayer audioUrl={recorder.finished.url} label="Replay this take" hint="Saved automatically to history." />}
              {previousInSession && previousInSession.passage === passage && (
                <InSessionComparison
                  previous={previousInSession}
                  current={{ result, audioUrl: recorder.finished?.url ?? null }}
                />
              )}
              <ResultsView
                result={result}
                audioUrl={null}
                onRetry={recordAgain}
                onNewText={newText}
                hideAudio
              />
              {saver.serverId && (
                <p className="text-sm">
                  <Link href={`/history/${saver.serverId}`} className="font-semibold text-[#2563eb]">
                    View in history
                  </Link>
                </p>
              )}
              {resultsHeader}
            </div>
          )}

          {phase === "success" && result && recorder.autoStopped && (
            <p className="mx-auto max-w-3xl text-center text-xs text-stone-500 dark:text-stone-400">
              This attempt used the full 30 seconds.
            </p>
          )}
          </>
          )}
        </div>

        <footer className="mx-auto mt-12 max-w-3xl border-t border-stone-200 pt-5 text-center text-xs leading-5 text-stone-500 dark:border-white/10 dark:text-stone-400">
          <p className="font-semibold text-stone-600 dark:text-stone-300">Practice, listen, improve.</p>
          <p className="mt-1">Finished recordings and feedback are saved automatically to your history.</p>
          <p>Audio is sent to the app server for storage and to Azure Speech for evaluation.</p>
        </footer>
      </main>
    </div>
  );
}

function InSessionComparison({
  previous,
  current,
}: {
  previous: { result: AssessmentResult; audioUrl: string | null; passage: string };
  current: { result: AssessmentResult; audioUrl: string | null };
}) {
  return (
    <section
      aria-label="Compared with your previous try in this session"
      className="rounded-3xl border border-stone-200 bg-white p-5 shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.04]"
    >
      <h3 className="text-base font-extrabold tracking-tight">Compared with your previous try</h3>
      <p className="mt-1 text-[13px] text-stone-500">Same text, same session · practice feedback, not a proficiency rating.</p>
      <div className="mt-3 space-y-1">
        <p className="text-xs font-bold uppercase tracking-widest text-stone-400">Overall</p>
        <ScoreDelta previous={previous.result.pronunciationScore} current={current.result.pronunciationScore} />
        <div className="grid grid-cols-2 gap-2 pt-2 text-sm sm:grid-cols-4">
          {(
            [
              ["Accuracy", previous.result.accuracyScore, current.result.accuracyScore],
              ["Fluency", previous.result.fluencyScore, current.result.fluencyScore],
              ["Completeness", previous.result.completenessScore, current.result.completenessScore],
              ["Prosody", previous.result.prosodyScore, current.result.prosodyScore],
            ] as Array<[string, number | undefined, number | undefined]>
          ).map(([label, p, c]) => (
            <div key={label} className="rounded-xl bg-stone-50 px-3 py-2 dark:bg-black/20">
              <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">{label}</p>
              <ScoreDelta previous={p ?? null} current={c ?? null} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-sm font-bold">Previous try</p>
          {previous.audioUrl ? (
            <audio controls preload="metadata" src={previous.audioUrl} className="mt-3 w-full" aria-label="Previous try playback" />
          ) : (
            <p className="mt-2 text-[13px] text-stone-500">Previous audio is not available in this tab.</p>
          )}
        </div>
        <div className="rounded-2xl border border-stone-900 bg-stone-50 p-4 dark:border-white/20 dark:bg-black/30">
          <p className="text-sm font-bold">This try</p>
          <p className="mt-1 text-[13px] text-stone-500">Use the player above the results to replay this take.</p>
        </div>
      </div>
    </section>
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
