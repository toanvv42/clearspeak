"use client";

import { formatElapsed, MAX_RECORDING_SECONDS } from "@/lib/audio/wav";

export default function RecordingSession({
  passage,
  practiceLabel,
  elapsedMs,
  level,
  onFinish,
  onCancel,
  busy,
}: {
  passage: string;
  practiceLabel: string;
  elapsedMs: number;
  level: number;
  onFinish: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const elapsed = formatElapsed(elapsedMs / 1000);
  const remaining = Math.max(0, MAX_RECORDING_SECONDS - Math.floor(elapsedMs / 1000));
  const pct = Math.min(100, (elapsedMs / (MAX_RECORDING_SECONDS * 1000)) * 100);

  return (
    <section aria-label="Recording" className="rounded-2xl border border-[#e5ddcb] bg-white p-5 shadow-sm sm:p-6 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="recording-pulse inline-block h-3 w-3 rounded-full bg-[#f0554d]" />
        <p className="text-base font-semibold" role="status">
          Recording <span className="tabular-nums">· {elapsed}</span>
        </p>
        <p className="ml-auto text-sm tabular-nums opacity-70">{remaining}s left</p>
      </div>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide opacity-60">{practiceLabel}</p>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Recording time used"
      >
        <div className="h-full rounded-full bg-[#f0554d]" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 flex items-center gap-3" aria-hidden="true">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-[#2563eb] transition-[width]"
            style={{ width: `${Math.round(Math.max(0, Math.min(1, level)) * 100)}%` }}
          />
        </div>
        <span className="text-xs opacity-70">mic level</span>
      </div>
      <blockquote className="mt-5 rounded-xl bg-[#faf7f1] p-5 text-xl leading-9 dark:bg-black/30">
        {passage}
      </blockquote>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onFinish}
          disabled={busy}
          className="flex-1 rounded-xl bg-[#2563eb] px-5 py-3.5 text-base font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50"
        >
          Finish &amp; analyze
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-xl border border-[#d8cfb8] px-5 py-3.5 text-base font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
      <p className="mt-3 text-xs opacity-70">Recording stops automatically at 30 seconds.</p>
    </section>
  );
}
