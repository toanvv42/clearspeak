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
  const lowTime = remaining <= 5;

  return (
    <section aria-label="Recording" className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.04]">
      <div className="border-b border-stone-100 px-5 py-4 sm:px-6 dark:border-white/10">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-[13px] font-bold text-red-700 dark:bg-red-950/60 dark:text-red-200">
            <span aria-hidden="true" className="recording-pulse inline-block h-2.5 w-2.5 rounded-full bg-[#f0554d]" />
            <span role="status" className="tabular-nums">REC · {elapsed}</span>
          </span>
          <p className={`ml-auto text-sm font-bold tabular-nums ${lowTime ? "text-red-700 dark:text-red-300" : "text-stone-500 dark:text-stone-400"}`}>
            {remaining}s left
          </p>
        </div>
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-200/80 dark:bg-white/10"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Recording time used"
        >
          <div
            className={`h-full rounded-full transition-all ${lowTime ? "bg-red-600" : "bg-stone-900 dark:bg-white"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-6 flex-1 items-center gap-[3px]" aria-hidden="true">
            {Array.from({ length: 32 }).map((_, i) => {
              const active = Math.round(Math.max(0, Math.min(1, level)) * 32) > i;
              return (
                <span
                  key={i}
                  className={`w-full rounded-full transition-all ${active ? "bg-[#2563eb]" : "bg-stone-200 dark:bg-white/10"}`}
                  style={{ height: `${30 + ((i * 37) % 70)}%`, opacity: active ? 1 : 0.7 }}
                />
              );
            })}
          </div>
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-widest text-stone-400">mic live</span>
        </div>
      </div>

      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-stone-400">{practiceLabel}</p>
        <blockquote
          className="mt-2 rounded-2xl bg-[#faf9f6] p-5 text-[19px] leading-9 text-stone-900 sm:text-xl dark:bg-black/30 dark:text-stone-100"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {passage}
        </blockquote>
        <p className="mt-3 text-[13px] text-stone-500 dark:text-stone-400">Speak naturally at a steady pace — you can finish early.</p>
        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={onFinish}
            disabled={busy}
            className="flex-1 rounded-2xl bg-stone-900 px-5 py-3.5 text-[15px] font-bold text-white shadow-sm transition hover:bg-stone-700 active:scale-[0.99] disabled:opacity-50 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"
          >
            {busy ? "Finishing…" : "Finish & analyze"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-2xl border border-stone-300 bg-white px-5 py-3.5 text-[15px] font-semibold transition hover:bg-stone-50 active:scale-[0.99] disabled:opacity-50 dark:border-white/15 dark:bg-transparent dark:hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-stone-400 sm:text-left">Recording stops automatically at 30 seconds.</p>
      </div>
    </section>
  );
}
