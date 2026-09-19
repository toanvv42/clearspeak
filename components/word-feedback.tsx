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
  strong: "border-green-700/30 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100",
  review: "border-amber-700/30 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-100",
  focus: "border-red-700/30 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100",
  omitted: "border-dashed border-neutral-400 bg-neutral-100 text-neutral-700 dark:bg-white/5 dark:text-neutral-300",
};

const BAND_DOT: Record<ScoreBand, string> = {
  strong: "bg-green-700",
  review: "bg-amber-600",
  focus: "bg-red-600",
  omitted: "bg-neutral-400",
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
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-base ${BAND_STYLE[band]} ${
                isSelected ? "ring-2 ring-[#2563eb] ring-offset-1" : ""
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
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowInserted((v) => !v)}
            aria-expanded={showInserted}
            className="text-sm font-medium text-[#2563eb] underline underline-offset-2"
          >
            Extra words heard ({extras.length}){showInserted ? " — hide" : ""}
          </button>
          {showInserted && (
            <p className="mt-1 text-sm opacity-80">
              {extras.map((w) => w.text).join(" · ")}
            </p>
          )}
        </div>
      )}

      {selected && (
        <div
          className="mt-4 rounded-xl border border-[#2563eb]/25 bg-[#f4f7ff] p-4 dark:bg-black/30"
          role="region"
          aria-label={`Details for ${selected.text}`}
          tabIndex={-1}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-lg font-bold">“{selected.text}”</h4>
            <p className="text-sm">
              Accuracy <strong className="tabular-nums">{formatScore(selected.accuracyScore)}</strong>
              {selected.errorType && selected.errorType !== "None" && (
                <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold dark:bg-white/10">
                  {selected.errorType}
                </span>
              )}
            </p>
          </div>
          {selected.syllables.length > 0 && (
            <p className="mt-2 text-sm opacity-80">
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
                    className={`rounded-lg border px-2 py-1 font-mono text-sm ${BAND_STYLE[band]}`}
                  >
                    /{p.symbol}/
                    <span className="ml-1 text-xs tabular-nums">{formatScore(p.accuracyScore)}</span>
                    {(p.position === "initial" || p.position === "final" || p.position === "only") && (
                      <span className="ml-1 text-[10px] font-sans font-bold uppercase opacity-70">
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
            <p className="mt-2 text-sm opacity-70">
              {isWordOmitted(selected)
                ? "Azure marked this word as omitted, so no sound detail is available."
                : "No sound detail was returned for this word."}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs opacity-75" aria-label="Score legend">
        <span className="font-semibold">Legend:</span>
        <span><span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full bg-green-700" />80–100 strong</span>
        <span><span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-600" />60–79 review</span>
        <span><span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full bg-red-600" />below 60 focus</span>
        <span><span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full bg-neutral-400" />omitted</span>
      </div>
    </div>
  );
}
