"use client";

import { useEffect, useRef, useState } from "react";
import { formatScore } from "@/lib/assessment-guidance";

export default function AttemptAudio({
  attemptId,
  label,
  title,
}: {
  attemptId: string;
  label: string;
  title?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      let code: string | undefined;
      try {
        code = sessionStorage.getItem("clearspeak-access") ?? undefined;
      } catch {
        code = undefined;
      }
      const res = await fetch(`/api/attempts/${attemptId}/audio`, {
        headers: code ? { "x-app-access-code": code } : {},
      });
      if (!res.ok) throw new Error(`Audio request failed (${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = objectUrl;
      setUrl(objectUrl);
    } catch {
      setError("Could not load audio. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold">
          {label}
          {title && <span className="ml-2 font-normal text-stone-500">· {title}</span>}
        </p>
        {!url && (
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-full border border-stone-300 px-3 py-1.5 text-[13px] font-semibold disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load audio"}
          </button>
        )}
      </div>
      {url ? (
        <audio controls preload="metadata" src={url} className="mt-3 w-full" aria-label={`${label} playback`} />
      ) : (
        <p className="mt-2 text-[13px] text-stone-500">Audio loads only when you ask, to keep history fast.</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[13px] font-medium text-red-700">
          {error}{" "}
          <button type="button" onClick={load} className="underline underline-offset-2">
            Retry
          </button>
        </p>
      )}
    </div>
  );
}

export function ScoreDelta({ previous, current }: { previous?: number | null; current?: number | null }) {
  const fmt = (v?: number | null) => (typeof v === "number" ? formatScore(v) : "—");
  const delta =
    typeof previous === "number" && typeof current === "number"
      ? current - previous
      : null;
  return (
    <p className="text-sm tabular-nums">
      <span className="text-stone-500">Prev {fmt(previous)}</span>
      {" → "}
      <strong>{fmt(current)}</strong>
      {delta !== null && (
        <span className={`ml-2 font-bold ${delta >= 0 ? "text-emerald-700" : "text-red-700"}`}>
          {delta >= 0 ? "+" : ""}
          {Number.isInteger(delta) ? delta : delta.toFixed(1)}
        </span>
      )}
    </p>
  );
}
