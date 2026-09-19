"use client";

import { useMemo, useState } from "react";
import { alignReferenceWords } from "@/lib/alignment";
import {
  formatScore,
  scoreBandForPhoneme,
  scoreBandForWord,
} from "@/lib/assessment-guidance";
import { isWordOmitted } from "@/lib/azure/result-parser";
import type { AssessmentResult, ScoreBand } from "@/lib/types";

const BAND_STYLE: Record<ScoreBand, string> = {
  strong: "border-emerald-700/25 bg-emerald-50 text-emerald-950 hover:border-emerald-700/40 dark:bg-emerald-950/40 dark:text-emerald-100",
  review: "border-amber-600/25 bg-amber-50 text-amber-950 hover:border-amber-600/40 dark:bg-amber-950/40 dark:text-amber-100",
  focus: "border-red-600/25 bg-red-50 text-red-950 hover:border-red-600/40 dark:bg-red-950/40 dark:text-red-100",
  omitted: "border-dashed border-stone-300 bg-stone-100 text-stone-600 dark:bg-white/5 dark:text-stone-300",
};

const BAND_DOT: Record<ScoreBand, string> = {
  strong: "bg-emerald-600",
  review: "bg-amber-500",
  focus: "bg-red-500",
  omitted: "bg-stone-400",
};

const BAND_LABEL: Record<ScoreBand, string> = {
  strong: "strong",
  review: "review",
  focus: "focus",
  omitted: "omitted",
};

export default function WordFeedback({ result }: { result: AssessmentResult }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showInserted, setShowInserted] = useState(false);
  const { tokens: aligned, extraWords } = useMemo(
    () => alignReferenceWords(result.referenceText, result.words),
    [result],
  );
  // Azure-flagged insertions plus assessed words that match no reference token.
  const extras = useMemo(
    () => [...result.insertedWords, ...extraWords],
    [result.insertedWords, extraWords],
  );

  const selected = aligned.find((t) => t.key === selectedKey)?.word ?? null;

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Word and sound feedback">
        {aligned.map((token) => {
          const band: ScoreBand = token.word
            ? scoreBandForWord(token.word.accuracyScore, token.word.errorType)
            : "omitted";
          const isSelected = token.key === selectedKey;
          const label = token.word
            ? `${token.display}, ${BAND_LABEL[band]}${
                token.word.accuracyScore !== undefined
                  ? `, score ${formatScore(token.word.accuracyScore)}`
                  : ""
              }`
            : `${token.display}, no score`;
          return (
            <button
              key={token.key}
              type="button"
              aria-label={label}
              aria-pressed={isSelected}
              onClick={() => setSelectedKey(isSelected ? null : token.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[15px] font-medium shadow-sm transition active:scale-[0.98] ${BAND_STYLE[band]} ${
                isSelected ? "ring-4 ring-[#2563eb]/20 ring-offset-0" : ""
              }`}
            >
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${BAND_DOT[band]}`} />
              <span>{token.display}</span>
              {token.word?.phonemes?.length ? (
                <span className="sr-only">
                  {" "}
                  with {token.word.phonemes.length} sounds
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {extras.length > 0 && (
        <div className="mt-3 rounded-2xl bg-stone-50 px-4 py-3 dark:bg-black/20">
          <button
            type="button"
            onClick={() => setShowInserted((v) => !v)}
            aria-expanded={showInserted}
            className="text-[13px] font-bold text-stone-600 underline-offset-2 hover:underline dark:text-stone-300"
          >
            Extra words heard ({extras.length}){showInserted ? " — hide" : ""}
          </button>
          {showInserted && (
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
              {extras.map((w) => w.text).join(" · ")}
            </p>
          )}
        </div>
      )}

      {selected && (
        <div
          className="rise-in mt-4 rounded-2xl border border-[#2563eb]/20 bg-[#f6f8ff] p-4 sm:p-5 dark:bg-black/30 dark:border-white/10"
          role="region"
          aria-label={`Details for ${selected.text}`}
          tabIndex={-1}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-lg font-extrabold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>“{selected.text}”</h4>
            <p className="text-sm text-stone-600 dark:text-stone-300">
              Accuracy <strong className="tabular-nums text-stone-900 dark:text-white">{formatScore(selected.accuracyScore)}</strong>
              {selected.errorType && selected.errorType !== "None" && (
                <span className="ml-2 rounded-full bg-stone-900 px-2 py-0.5 text-[11px] font-bold text-white dark:bg-white dark:text-stone-900">
                  {selected.errorType}
                </span>
              )}
            </p>
          </div>
          {selected.syllables.length > 0 && (
            <p className="mt-2 text-[13px] text-stone-500 dark:text-stone-400">
              Syllables:{" "}
              {selected.syllables
                .map(
                  (s) => `${s.text || "—"} (${formatScore(s.accuracyScore)})`,
                )
                .join(" · ")}
            </p>
          )}
          {selected.phonemes.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Sounds in this word">
              {selected.phonemes.map((p, i) => {
                const band = scoreBandForPhoneme(p.accuracyScore);
                const edge =
                  p.position === "initial"
                    ? "first sound"
                    : p.position === "final"
                      ? "final sound"
                      : p.position === "only"
                        ? "only sound"
                        : "middle sound";
                return (
                  <li
                    key={`${p.symbol}-${i}`}
                    title={`${edge} · score ${formatScore(p.accuracyScore)}`}
                    aria-label={`/${p.symbol}/, ${edge}, score ${formatScore(p.accuracyScore)}`}
                    className={`rounded-xl border bg-white px-2.5 py-1.5 font-mono text-sm shadow-sm dark:bg-white/5 ${BAND_STYLE[band]}`}
                  >
                    /{p.symbol}/
                    <span className="ml-1.5 text-xs font-bold tabular-nums">{formatScore(p.accuracyScore)}</span>
                    {(p.position === "initial" || p.position === "final" || p.position === "only") && (
                      <span className="ml-1.5 rounded bg-black/10 px-1 py-px text-[10px] font-sans font-bold uppercase tracking-wide opacity-70 dark:bg-white/10">
                        {p.position === "only" ? "only" : p.position === "initial" ? "first" : "final"}
                      </span>
                    )}
                    {p.alternatives.length > 0 && (
                      <span className="block font-sans text-[11px] opacity-75">
                        heard as {p.alternatives.slice(0, 2).map((a) => `/${a.symbol}/`).join(", ")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-stone-500">
              {isWordOmitted(selected)
                ? "Azure marked this word as omitted, so no sound detail is available."
                : "No sound detail was returned for this word."}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl bg-stone-50 px-4 py-3 text-xs text-stone-500 dark:bg-black/20 dark:text-stone-400" aria-label="Score legend">
        <span className="font-bold text-stone-600 dark:text-stone-300">Legend</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-600" />80–100 strong</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" />60–79 review</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-red-500" />below 60 focus</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-stone-400" />omitted</span>
      </div>
    </div>
  );
}
