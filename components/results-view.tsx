"use client";

import { useState } from "react";
import {
  endingSoundAlerts,
  formatScore,
  METRIC_EXPLANATIONS,
  overallLabel,
  soundsToFix,
  weakestMetric,
} from "@/lib/assessment-guidance";
import type { AssessmentResult } from "@/lib/types";
import ScoreCard from "@/components/score-card";
import WordFeedback from "@/components/word-feedback";
import LastRecordingPlayer from "@/components/last-recording-player";

export default function ResultsView({
  result,
  audioUrl,
  onRetry,
  onNewText,
}: {
  result: AssessmentResult;
  audioUrl: string | null;
  onRetry: () => void;
  onNewText: () => void;
}) {
  const [showRecognized, setShowRecognized] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const focus = weakestMetric(result);
  const sounds = soundsToFix(result);
  const endings = endingSoundAlerts(result);

  return (
    <section aria-label="Results" className="space-y-5">
      <div className="rounded-2xl border border-[#e5ddcb] bg-white p-5 text-center shadow-sm sm:p-6 dark:border-white/10 dark:bg-white/5">
        <p className="text-sm font-medium opacity-70">Overall pronunciation</p>
        <p
          className="mt-1 text-6xl font-black tabular-nums"
          aria-label={`Overall score ${formatScore(result.pronunciationScore)} out of 100, ${overallLabel(result.pronunciationScore)}`}
        >
          {formatScore(result.pronunciationScore)}
        </p>
        <p className="mt-1 inline-block rounded-full bg-[#2563eb]/10 px-3 py-1 text-sm font-semibold text-[#1d4ed8] dark:text-blue-200">
          {overallLabel(result.pronunciationScore)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ScoreCard label="Accuracy" score={result.accuracyScore} explanation={METRIC_EXPLANATIONS.accuracy} />
        <ScoreCard label="Fluency" score={result.fluencyScore} explanation={METRIC_EXPLANATIONS.fluency} />
        <ScoreCard label="Completeness" score={result.completenessScore} explanation={METRIC_EXPLANATIONS.completeness} />
        {result.prosodyScore !== undefined && (
          <ScoreCard label="Prosody" score={result.prosodyScore} explanation={METRIC_EXPLANATIONS.prosody} />
        )}
      </div>

      {sounds.length > 0 && (
        <div className="rounded-2xl border border-[#e5ddcb] bg-white p-5 shadow-sm sm:p-6 dark:border-white/10 dark:bg-white/5">
          <h3 className="text-lg font-bold">Sounds to fix</h3>
          <p className="mt-1 text-sm opacity-70">
            Your lowest-scoring sounds, grouped so each target appears once.
          </p>
          <ul className="mt-3 space-y-3">
            {sounds.map((s) => (
              <li key={`${s.symbol}-${s.word}`} className="rounded-xl border border-black/10 p-3 dark:border-white/10">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-[#2563eb]/10 px-2 py-1 font-mono text-lg font-bold">
                    /{s.symbol}/
                  </span>
                  <span className="text-sm">
                    in <strong>“{s.word}”</strong> · {s.positionLabel} of word · score{" "}
                    <strong className="tabular-nums">{formatScore(s.score)}</strong>
                    {s.occurrences > 1 && (
                      <span className="opacity-70"> · weak in {s.occurrences} places</span>
                    )}
                  </span>
                </div>
                {s.alternative && (
                  <p className="mt-1 text-sm opacity-80">
                    Likely heard as <span className="font-mono">/{s.alternative.symbol}/</span>
                    {s.alternative.confidence !== undefined &&
                      ` (confidence ${Math.round(s.alternative.confidence)})`}
                    .
                  </p>
                )}
                <p className="mt-1 text-sm font-medium">{s.prompt}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {endings.length > 0 && (
        <div
          role="note"
          aria-label="Ending sound alerts"
          className="rounded-2xl border border-amber-600/40 bg-amber-50 p-5 dark:bg-amber-950/60"
        >
          <h3 className="text-base font-bold">Watch your endings</h3>
          <ul className="mt-2 space-y-1">
            {endings.slice(0, 4).map((a) => (
              <li key={`${a.word}-${a.symbol}`} className="text-sm font-medium">
                <strong>Ending /{a.symbol}/ needs attention in “{a.word}”</strong>
                <span className="font-normal opacity-80"> — likely weak or missing.</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-[#e5ddcb] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
        <h3 className="text-base font-bold">Your focus for next time</h3>
        <p className="mt-1 text-sm leading-6">{focus.suggestion}</p>
        <p className="mt-1 text-xs opacity-60">
          App guidance derived from your scores — not an AI diagnosis.
        </p>
      </div>

      <div className="rounded-2xl border border-[#e5ddcb] bg-white p-5 shadow-sm sm:p-6 dark:border-white/10 dark:bg-white/5">
        <h3 className="text-lg font-bold">Word and sound feedback</h3>
        <p className="mt-1 text-sm opacity-70">
          Select any word to inspect each sound inside it. Color is only a helper — every chip
          also has a text label.
        </p>
        <div className="mt-3">
          <WordFeedback result={result} />
        </div>
      </div>

      <div className="rounded-2xl border border-[#e5ddcb] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
        <button
          type="button"
          onClick={() => setShowRecognized((v) => !v)}
          aria-expanded={showRecognized}
          className="text-sm font-semibold text-[#2563eb] underline underline-offset-2"
        >
          {showRecognized ? "Hide recognized text" : "Show recognized text"}
        </button>
        {showRecognized && (
          <p className="mt-2 text-sm leading-6 opacity-90">
            {result.recognizedText || "Azure returned no recognized text."}
          </p>
        )}
      </div>

      {audioUrl && <LastRecordingPlayer audioUrl={audioUrl} />}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onRetry}
          className="flex-1 rounded-xl bg-[#2563eb] px-5 py-3.5 text-base font-semibold text-white hover:bg-[#1d4ed8]"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={onNewText}
          className="flex-1 rounded-xl border border-[#d8cfb8] px-5 py-3.5 text-base font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
        >
          Practice new text
        </button>
      </div>

      {process.env.NODE_ENV !== "production" && (
        <div className="rounded-xl border border-dashed border-neutral-400 p-4">
          <button
            type="button"
            onClick={() => setShowDebug((v) => !v)}
            aria-expanded={showDebug}
            className="text-xs font-semibold uppercase tracking-wide opacity-70"
          >
            Developer diagnostics
          </button>
          {showDebug && (
            <pre className="mt-2 max-h-64 overflow-auto text-[11px] leading-4 opacity-80">
              {JSON.stringify(
                {
                  pronunciationScore: result.pronunciationScore,
                  accuracyScore: result.accuracyScore,
                  fluencyScore: result.fluencyScore,
                  completenessScore: result.completenessScore,
                  prosodyScore: result.prosodyScore,
                  wordCount: result.words.length,
                  insertedCount: result.insertedWords.length,
                },
                null,
                2,
              )}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
