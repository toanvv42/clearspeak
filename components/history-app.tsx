"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AccessGate from "@/components/access-gate";
import AppHeader from "@/components/app-header";
import { fetchAttemptList, getAccessCode, uploadAttempt, uploadEvaluation } from "@/lib/history/client";
import { clearAccessCode, hasAccessCode } from "@/lib/access-code";
import { pendingList, pendingRemove, pendingUpdate } from "@/lib/history/pending-saves";
import type { AttemptSummary } from "@/lib/history/types";

type Filter = "all" | "evaluated" | "pending" | "failed";

function statusLabel(s: AttemptSummary): string {
  if (s.evaluationState === "success") return "Evaluated";
  if (s.evaluationState === "failed") return "Evaluation failed";
  return "Needs evaluation";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function groupKey(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function pendingState(e: { evaluation: Record<string, unknown> | null }): AttemptSummary["evaluationState"] {
  const failure = (e.evaluation as { failure?: unknown } | null)?.failure;
  return failure ? "failed" : "pending";
}

function matchesQuery(item: AttemptSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.referenceText.toLowerCase().includes(q) ||
    (item.title ?? "").toLowerCase().includes(q)
  );
}

function matchesFilter(item: AttemptSummary, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "evaluated") return item.evaluationState === "success";
  if (filter === "pending") return item.evaluationState === "pending";
  return item.evaluationState === "failed";
}

export default function HistoryApp({ accessRequired }: { accessRequired: boolean }) {
  const [unlocked, setUnlocked] = useState(() => !accessRequired || hasAccessCode());
  const [items, setItems] = useState<AttemptSummary[]>([]);
  const [pending, setPending] = useState<AttemptSummary[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(
    async (opts?: { append?: boolean; cursorOverride?: string | null }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchAttemptList({
          search: search.trim() || undefined,
          filter: filter === "all" ? undefined : filter === "evaluated" ? "evaluated" : filter === "pending" ? "pending" : "failed",
          cursor: (opts?.cursorOverride ?? (opts?.append ? nextCursor : null)) ?? undefined,
          limit: 20,
        });
        setItems((prev) => (opts?.append ? [...prev, ...res.items] : res.items));
        setNextCursor(res.nextCursor);
      } catch (err) {
        // A rejected code drops back to the gate instead of a dead list.
        if ((err as { status?: number }).status === 401 && accessRequired) {
          clearAccessCode();
          setUnlocked(false);
          return;
        }
        setError("Could not load history. Check your connection and try again.");
      } finally {
        setLoading(false);
      }
    },
    [search, filter, nextCursor, accessRequired],
  );

  useEffect(() => {
    if (!unlocked) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // Drain browser-queued takes so pending rows sync without returning to Practice.
    const sync = async () => {
      setSyncing(true);
      try {
        const entries = await pendingList();
        const code = getAccessCode();
        for (const entry of entries) {
          try {
            if (!entry.audioSaved) {
              await uploadAttempt(entry.id, entry.metadata, entry.wav, code);
              await pendingUpdate(entry.id, { audioSaved: true });
            }
            if (entry.evaluation) {
              await uploadEvaluation(entry.id, entry.evaluation, code);
              await pendingRemove(entry.id);
            }
          } catch (err) {
            const status = (err as { status?: number }).status;
            const errCode = (err as { code?: string }).code;
            if (status === 410 || errCode === "deleted") {
              await pendingRemove(entry.id);
              continue;
            }
            if (status === 401 || status === 400 || status === 413) break;
            break;
          }
          await new Promise((r) => setTimeout(r, 150));
        }
      } finally {
        setSyncing(false);
      }
      const remaining = await pendingList();
      setPending(
        remaining.map((e) => ({
          id: e.id,
          schemaVersion: 1,
          recordedAt: new Date(e.updatedAt).toISOString(),
          durationMs: Number((e.metadata as Record<string, unknown>).durationMs ?? 0),
          stopReason: "manual" as const,
          referenceText: String((e.metadata as Record<string, unknown>).referenceText ?? ""),
          title: (e.metadata as Record<string, unknown>).title as string | null,
          level: (e.metadata as Record<string, unknown>).level as string | null,
          source: { kind: "custom" as const, hash: "pending" },
          scope: "passage" as const,
          locale: "en-US",
          evaluationState: pendingState(e),
          revision: 0,
          pronunciationScore: null,
          accuracyScore: null,
          fluencyScore: null,
          completenessScore: null,
          prosodyScore: null,
          hasAudio: false,
        })),
      );
      void load();
    };
    void sync();
    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked) return;
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filter]);

  if (accessRequired && !unlocked) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] dark:bg-stone-950">
        <AppHeader />
        <AccessGate onUnlock={() => setUnlocked(true)} />
      </div>
    );
  }

  const merged = [
    ...pending
      .filter((p) => !items.some((i) => i.id === p.id))
      .filter((p) => matchesQuery(p, search) && matchesFilter(p, filter)),
    ...items,
  ];

  let lastGroup = "";
  return (
    <div className="min-h-screen bg-[#f8f7f4] text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-4 pb-20 sm:px-6">
        <h1 className="mt-6 text-2xl font-extrabold tracking-tight">History</h1>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label className="flex-1">
            <span className="sr-only">Search history</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or text…"
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#2563eb] dark:border-white/15 dark:bg-black/30"
            />
          </label>
          <div role="group" aria-label="Filter" className="flex gap-1">
            {(["all", "evaluated", "pending", "failed"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`rounded-full px-3 py-1.5 text-[13px] font-semibold capitalize ${
                  filter === f ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "bg-stone-200/70 dark:bg-white/10"
                }`}
              >
                {f === "pending" ? "Needs evaluation" : f}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}{" "}
            <button type="button" onClick={() => void load()} className="underline">
              Retry
            </button>
          </p>
        )}

        {!loading && !error && merged.length === 0 && (
          <div className="mt-6 rounded-3xl border border-stone-200 bg-white p-8 text-center">
            <p className="font-bold">Your practice history starts with your first recording.</p>
            <Link href="/" className="mt-3 inline-block rounded-2xl bg-stone-900 px-5 py-2.5 text-sm font-bold text-white">
              Start practicing
            </Link>
          </div>
        )}

        <ul className="mt-4 space-y-2">
          {merged.map((item) => {
            const group = groupKey(item.recordedAt);
            const showGroup = group !== lastGroup;
            lastGroup = group;
            const isPending = pending.some((p) => p.id === item.id);
            // Pending takes exist only in this browser so far: no detail page
            // yet. Render them without a link plus an explicit sync action.
            if (isPending) {
              return (
                <li key={item.id}>
                  {showGroup && <p className="px-1 pb-1 pt-3 text-xs font-bold uppercase tracking-widest text-stone-400">{group}</p>}
                  <div className="block rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-3 dark:border-white/15 dark:bg-white/[0.04]">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[15px] font-bold">
                        {item.title ?? item.referenceText.slice(0, 60)}
                      </span>
                      <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-bold tabular-nums dark:bg-white/10">
                        —
                      </span>
                    </span>
                    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-stone-500">
                      <span>{formatDate(item.recordedAt)}</span>
                      {item.level && <span>{item.level}</span>}
                      {item.durationMs > 0 && <span>{Math.round(item.durationMs / 1000)}s</span>}
                      <span className="font-semibold">Waiting to sync{syncing ? "…" : ""}</span>
                    </span>
                  </div>
                </li>
              );
            }
            return (
              <li key={item.id}>
                {showGroup && <p className="px-1 pb-1 pt-3 text-xs font-bold uppercase tracking-widest text-stone-400">{group}</p>}
                <Link
                  href={`/history/${item.id}`}
                  className="block rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm transition hover:border-stone-400 dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[15px] font-bold">
                      {item.title ?? item.referenceText.slice(0, 60)}
                    </span>
                    <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-bold tabular-nums dark:bg-white/10">
                      {typeof item.pronunciationScore === "number" ? item.pronunciationScore : "—"}
                    </span>
                  </span>
                  <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-stone-500">
                    <span>{formatDate(item.recordedAt)}</span>
                    {item.level && <span>{item.level}</span>}
                    <span>{Math.round(item.durationMs / 1000)}s</span>
                    <span className="font-semibold">{isPending ? "Waiting to sync" : statusLabel(item)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        {nextCursor && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void load({ append: true })}
            className="mt-4 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-bold disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        )}
      </main>
    </div>
  );
}
