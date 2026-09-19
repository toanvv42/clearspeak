"use client";

import AttemptAudio, { ScoreDelta } from "@/components/attempt-audio";
import type { AttemptDetail } from "@/lib/history/types";

export default function ComparisonView({ detail }: { detail: AttemptDetail }) {
  const prev = detail.previousSummary;
  if (!prev) return null;
  if (detail.stopReason === "limit") {
    return (
      <p className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-[13px] text-stone-500">
        This take used the full 30 seconds, so automatic comparison is skipped this time.
      </p>
    );
  }
  return (
    <section
      aria-label="Compared with your previous attempt"
      className="rounded-3xl border border-stone-200 bg-white p-5 shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.04]"
    >
      <h3 className="text-base font-extrabold tracking-tight">Compared with your previous attempt</h3>
      <p className="mt-1 text-[13px] text-stone-500">
        Same text and settings · practice feedback, not a proficiency rating.
      </p>
      <div className="mt-3 space-y-1">
        <p className="text-xs font-bold uppercase tracking-widest text-stone-400">Overall</p>
        <ScoreDelta previous={prev.pronunciationScore} current={detail.pronunciationScore} />
        <div className="grid grid-cols-2 gap-2 pt-2 text-sm sm:grid-cols-4">
          {(
            [
              ["Accuracy", prev.accuracyScore, detail.accuracyScore],
              ["Fluency", prev.fluencyScore, detail.fluencyScore],
              ["Completeness", prev.completenessScore, detail.completenessScore],
              ["Prosody", prev.prosodyScore, detail.prosodyScore],
            ] as Array<[string, number | null, number | null]>
          ).map(([label, p, c]) => (
            <div key={label} className="rounded-xl bg-stone-50 px-3 py-2 dark:bg-black/20">
              <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">{label}</p>
              <ScoreDelta previous={p} current={c} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <AttemptAudio attemptId={prev.id} label="Previous" />
        <div className="rounded-2xl border border-stone-900 bg-stone-50 p-4 dark:border-white/20 dark:bg-black/30">
          <p className="text-sm font-bold">This attempt</p>
          <p className="mt-1 text-[13px] text-stone-500">Use the player above the results to replay this take.</p>
        </div>
      </div>
    </section>
  );
}
