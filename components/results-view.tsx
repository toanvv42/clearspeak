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
  const overall = typeof result.pronunciationScore === "number" ? Math.max(0, Math.min(100, result.pronunciationScore)) : 0;
  const ring = 2 * Math.PI * 44;

  return (
    <section aria-label="Results" className="space-y-4">
      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-col items-center gap-5 px-6 py-8 text-center sm:flex-row sm:gap-8 sm:text-left">
          <div className="relative h-32 w-32 shrink-0" role="img" aria-label={`Overall score ${formatScore(result.pronunciationScore)} out of 100, ${overallLabel(result.pronunciationScore)}`}>
            <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
              <circle cx="50" cy="50" r="44" fill="none" strokeWidth="9" className="stroke-stone-200 dark:stroke-white/10" />
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                strokeWidth="9"
                strokeLinecap="round"
                className={overall >= 80 ? "stroke-emerald-600" : overall >= 60 ? "stroke-amber-500" : "stroke-red-500"}
                strokeDasharray={ring}
                strokeDashoffset={ring - (ring * overall) / 100}
              />
            </svg>
            <p className="absolute inset-0 flex items-center justify-center text-4xl font-black tabular-nums tracking-tight">
              {formatScore(result.pronunciationScore)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">Overall pronunciation</p>
            <p className="mt-1 inline-block rounded-full bg-stone-900 px-3 py-1 text-sm font-bold text-white dark:bg-white dark:text-stone-900">
              {overallLabel(result.pronunciationScore)}
            </p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-stone-500 dark:text-stone-400">
              {overall >= 80
                ? "Solid delivery — polish the sounds below to push higher."
                : overall >= 60
                  ? "Good foundation — a few sounds are holding your score back."
                  : "Good effort — focus on the top sounds below on your next try."}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-stone-100 bg-[#faf9f6] p-4 sm:p-5 lg:grid-cols-4 dark:border-white/10 dark:bg-black/20">
          <ScoreCard label="Accuracy" score={result.accuracyScore} explanation={METRIC_EXPLANATIONS.accuracy} />
          <ScoreCard label="Fluency" score={result.fluencyScore} explanation={METRIC_EXPLANATIONS.fluency} />
          <ScoreCard label="Completeness" score={result.completenessScore} explanation={METRIC_EXPLANATIONS.completeness} />
          {result.prosodyScore !== undefined && (
            <ScoreCard label="Prosody" score={result.prosodyScore} explanation={METRIC_EXPLANATIONS.prosody} />
          )}
        </div>
      </div>

      {sounds.length > 0 && (
        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-[var(--shadow-card)] sm:p-6 dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-lg font-extrabold tracking-tight">Sounds to fix</h3>
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold tabular-nums text-stone-600 dark:bg-white/10 dark:text-stone-300">
              Top {sounds.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Your lowest-scoring sounds, grouped so each target appears once.
          </p>
          <ul className="mt-4 space-y-2.5">
            {sounds.map((s, i) => (
              <li key={`${s.symbol}-${s.word}`} className="rounded-2xl border border-stone-200 bg-[#faf9f6] p-4 transition hover:border-stone-300 dark:border-white/10 dark:bg-black/20">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-[11px] font-bold tabular-nums text-white dark:bg-white dark:text-stone-900">
                    {i + 1}
                  </span>
                  <span className="rounded-lg bg-white px-2 py-1 font-mono text-lg font-bold shadow-sm dark:bg-white/10">
                    /{s.symbol}/
                  </span>
                  <span className="text-sm text-stone-600 dark:text-stone-300">
                    in <strong className="text-stone-900 dark:text-white">“{s.word}”</strong> · {s.positionLabel} of word · score{" "}
                    <strong className="tabular-nums">{formatScore(s.score)}</strong>
                    {s.occurrences > 1 && (
                      <span className="opacity-70"> · weak in {s.occurrences} places</span>
                    )}
                  </span>
                </div>
                {s.alternative && (
                  <p className="mt-1.5 text-[13px] text-stone-500 dark:text-stone-400">
                    Likely heard as <span className="font-mono font-semibold">/{s.alternative.symbol}/</span>
                    {s.alternative.confidence !== undefined &&
                      ` (confidence ${Math.round(s.alternative.confidence)})`}
                    .
                  </p>
                )}
                <p className="mt-1.5 text-sm font-semibold">{s.prompt}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {endings.length > 0 && (
        <div
          role="note"
          aria-label="Ending sound alerts"
          className="rounded-3xl border border-amber-600/25 bg-amber-50/80 p-5 sm:p-6 dark:bg-amber-950/40"
        >
          <h3 className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight">
            <span aria-hidden="true">⚠</span> Watch your endings
          </h3>
          <ul className="mt-2 space-y-1.5">
            {endings.slice(0, 4).map((a) => (
              <li key={`${a.word}-${a.symbol}`} className="text-sm font-medium">
                <strong>Ending /{a.symbol}/ needs attention in “{a.word}”</strong>
                <span className="font-normal opacity-80"> — likely weak or missing.</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-3xl border border-stone-900 bg-stone-900 p-5 text-white sm:p-6 dark:border-white/10 dark:bg-white dark:text-stone-900">
        <h3 className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight">
          <span aria-hidden="true">✦</span> Your focus for next time
        </h3>
        <p className="mt-2 text-sm leading-6 opacity-90">{focus.suggestion}</p>
        <p className="mt-2 text-xs opacity-60">
          App guidance derived from your scores — not an AI diagnosis.
        </p>
      </div>

      <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-[var(--shadow-card)] sm:p-6 dark:border-white/10 dark:bg-white/[0.04]">
        <h3 className="text-lg font-extrabold tracking-tight">Word and sound feedback</h3>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Select any word to inspect each sound inside it. Color is only a helper — every chip
          also has a text label.
        </p>
        <div className="mt-4">
          <WordFeedback result={result} />
        </div>
      </div>

      <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.04]">
        <button
          type="button"
          onClick={() => setShowRecognized((v) => !v)}
          aria-expanded={showRecognized}
          className="flex items-center gap-1.5 text-sm font-bold text-[#2563eb] underline-offset-2 hover:underline"
        >
          <span aria-hidden="true" className={`transition ${showRecognized ? "rotate-90" : ""}`}>›</span>
          {showRecognized ? "Hide recognized text" : "Show recognized text"}
        </button>
        {showRecognized && (
          <p className="mt-2 rounded-2xl bg-stone-50 p-4 text-sm leading-6 text-stone-700 dark:bg-black/20 dark:text-stone-200">
            {result.recognizedText || "Azure returned no recognized text."}
          </p>
        )}
      </div>

      {audioUrl && <LastRecordingPlayer audioUrl={audioUrl} />}

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <button
          type="button"
          onClick={onRetry}
          className="flex-1 rounded-2xl bg-stone-900 px-5 py-3.5 text-[15px] font-bold text-white shadow-sm transition hover:bg-stone-700 active:scale-[0.99] dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={onNewText}
          className="flex-1 rounded-2xl border border-stone-300 bg-white px-5 py-3.5 text-[15px] font-semibold transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/15 dark:bg-transparent dark:hover:bg-white/10"
        >
          Practice new text
        </button>
      </div>

      {process.env.NODE_ENV !== "production" && (
        <div className="rounded-2xl border border-dashed border-stone-300 p-4 dark:border-white/20">
          <button
            type="button"
            onClick={() => setShowDebug((v) => !v)}
            aria-expanded={showDebug}
            className="text-xs font-bold uppercase tracking-widest text-stone-500"
          >
            Developer diagnostics
          </button>
          {showDebug && (
            <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-stone-950 p-3 text-[11px] leading-4 text-stone-200">
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
