"use client";

import { formatScore } from "@/lib/assessment-guidance";

export default function ScoreCard({
  label,
  score,
  explanation,
}: {
  label: string;
  score: number | undefined;
  explanation: string;
}) {
  const pct = typeof score === "number" && Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  const bar = pct >= 80 ? "bg-emerald-600" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.04]">
      <p className="text-[13px] font-semibold text-stone-500 dark:text-stone-400">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight" aria-label={`${label} ${formatScore(score)} out of 100`}>
        {formatScore(score)}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200/70 dark:bg-white/10" aria-hidden="true">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs leading-5 text-stone-500 dark:text-stone-400">{explanation}</p>
    </div>
  );
}
