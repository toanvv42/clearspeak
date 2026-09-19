"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AccessGate from "@/components/access-gate";
import AppHeader from "@/components/app-header";
import { ScoreDelta } from "@/components/attempt-audio";
import { useStoredAccessCode } from "@/hooks/use-access-code";
import { fetchProgress, type ProgressOverview } from "@/lib/history/client";
import { clearAccessCode } from "@/lib/access-code";
import type { TargetStats } from "@/lib/review-schedule";

function statLine(label: string, entry: { score: number | null; at: string } | null): string {
  if (!entry) return `${label}: —`;
  const score = typeof entry.score === "number" ? entry.score : "—";
  return `${label}: ${score} (${new Date(entry.at).toLocaleDateString()})`;
}

function TargetCard({ stat }: { stat: TargetStats }) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]">
      <h3 className="truncate text-[15px] font-bold tracking-tight">{stat.title}</h3>
      <p className="mt-0.5 text-[13px] text-stone-500 tabular-nums">
        {stat.attempts} {stat.attempts === 1 ? "attempt" : "attempts"} · comparable text only
      </p>
      <div className="mt-2">
        <ScoreDelta previous={stat.first?.score ?? null} current={stat.latest?.score ?? null} />
      </div>
      <ul className="mt-2 space-y-0.5 text-[13px] text-stone-600 dark:text-stone-300">
        <li>{statLine("First", stat.first)}</li>
        <li>{statLine("Latest", stat.latest)}</li>
        <li>{statLine("Best", stat.best)}</li>
      </ul>
    </article>
  );
}

export default function ProgressApp({ accessRequired }: { accessRequired: boolean }) {
  const accessCode = useStoredAccessCode();
  const unlocked = !accessRequired || accessCode !== undefined;
  const [data, setData] = useState<ProgressOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await fetchProgress());
    } catch (err) {
      if ((err as { status?: number }).status === 401 && accessRequired) {
        clearAccessCode();
        return;
      }
      setError("Could not load progress. Check your connection and try again.");
    }
  }, [accessRequired]);

  useEffect(() => {
    if (!unlocked) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [unlocked, load]);

  if (accessRequired && !unlocked) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] dark:bg-stone-950">
        <AppHeader />
        <AccessGate />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f7f4] text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl space-y-5 px-4 pb-20 sm:px-6">
        <h1 className="mt-6 text-2xl font-extrabold tracking-tight">Progress</h1>

        {error && (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}{" "}
            <button type="button" onClick={() => void load()} className="underline">
              Retry
            </button>
          </p>
        )}

        {!data && !error && <p className="text-sm text-stone-500">Loading…</p>}

        {data && (
          <>
            <section aria-label="Overview" className="grid grid-cols-3 gap-2">
              {[
                ["Takes", String(data.totals.attempts)],
                ["Practice days", String(data.totals.practiceDays)],
                ["Due now", String(data.due.length)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-center dark:border-white/10 dark:bg-white/[0.04]">
                  <p className="text-2xl font-black tabular-nums">{value}</p>
                  <p className="text-xs font-bold uppercase tracking-widest text-stone-400">{label}</p>
                </div>
              ))}
            </section>

            <section aria-label="This week" className="rounded-3xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
              <h2 className="text-base font-extrabold tracking-tight">This week</h2>
              <p className="mt-0.5 text-[13px] text-stone-500">Takes per day for the last 7 days.</p>
              <ul className="mt-3 space-y-1.5">
                {data.weekly.map((day) => (
                  <li key={day.date} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 tabular-nums text-stone-500">
                      {new Date(`${day.date}T00:00:00.000Z`).toLocaleDateString(undefined, { weekday: "short", month: "numeric", day: "numeric" })}
                    </span>
                    <span
                      className="h-2.5 min-w-2 rounded-full bg-stone-900 dark:bg-white"
                      style={{ width: `${Math.min(100, day.attempts * 20)}%` }}
                      role="img"
                      aria-label={`${day.attempts} takes on ${day.date}`}
                    />
                    <span className="tabular-nums font-bold">{day.attempts}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-label="Due for review" className="rounded-3xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
              <h2 className="text-base font-extrabold tracking-tight">Due for review</h2>
              {data.due.length === 0 ? (
                <p className="mt-1 text-sm text-stone-500">
                  Nothing is due. Practice a passage and it will reappear here tomorrow.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {data.due.map((item) => (
                    <li key={item.targetKey} className="flex flex-wrap items-center gap-3 rounded-xl bg-stone-50 px-3 py-2 dark:bg-black/20">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{item.title}</p>
                        <p className="text-[13px] text-stone-500 tabular-nums">
                          {item.practiceCount} {item.practiceCount === 1 ? "take" : "takes"}
                          {typeof item.lastScore === "number" ? ` · last ${item.lastScore}` : ""}
                        </p>
                      </div>
                      <Link
                        href={`/?repeat=${item.latestAttemptId}`}
                        className="rounded-full bg-stone-900 px-3 py-1.5 text-[13px] font-bold text-white dark:bg-white dark:text-stone-900"
                      >
                        Practice
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Per-passage results">
              <h2 className="text-base font-extrabold tracking-tight">First, latest, best</h2>
              <p className="mt-0.5 text-[13px] text-stone-500">
                Same text only — never averaged across different passages.
              </p>
              {data.stats.length === 0 ? (
                <p className="mt-2 text-sm text-stone-500">
                  No evaluated takes yet. <Link href="/" className="font-semibold text-[#2563eb]">Start practicing</Link>
                </p>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {data.stats.map((stat) => (
                    <TargetCard key={stat.targetKey} stat={stat} />
                  ))}
                </div>
              )}
            </section>

            {data.favourites.length > 0 && (
              <section aria-label="Favourites" className="rounded-3xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
                <h2 className="text-base font-extrabold tracking-tight">Favourites</h2>
                <ul className="mt-2 space-y-1.5">
                  {data.favourites.map((fav) => (
                    <li key={fav.targetKey} className="text-sm">
                      <span className="font-bold">★ {fav.title}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
