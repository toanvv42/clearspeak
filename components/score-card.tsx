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
  return (
    <div className="rounded-xl border border-[#e5ddcb] bg-[#fffdf8] p-4 dark:border-white/10 dark:bg-black/20">
      <p className="text-sm font-medium opacity-70">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums" aria-label={`${label} ${formatScore(score)} out of 100`}>
        {formatScore(score)}
      </p>
      <p className="mt-1 text-xs leading-5 opacity-70">{explanation}</p>
    </div>
  );
}
