"use client";

const STEPS = ["Preparing audio", "Securely connecting", "Assessing speech"];

export default function AnalyzingState({ step }: { step: number }) {
  return (
    <section
      aria-label="Analyzing"
      className="rounded-3xl border border-stone-200 bg-white p-5 shadow-[var(--shadow-card)] sm:p-8 dark:border-white/10 dark:bg-white/[0.04]"
    >
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-stone-900 dark:bg-white"
        >
          <span className="block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent dark:border-stone-900 dark:border-t-transparent" />
        </span>
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">Analyzing your pronunciation…</h2>
          <p className="text-[13px] text-stone-500 dark:text-stone-400">Usually takes a few seconds</p>
        </div>
      </div>
      <ol className="mt-6 space-y-3">
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={label} className="flex items-center gap-3 text-sm">
              <span
                aria-hidden="true"
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums transition-colors ${
                  done
                    ? "bg-emerald-700 text-white"
                    : active
                      ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900"
                      : "bg-stone-200/70 text-stone-400 dark:bg-white/10"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={done || active ? "font-semibold" : "text-stone-400"}>
                {label}
                {active && <span className="sr-only"> (in progress)</span>}
                {active && <span aria-hidden="true" className="ml-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#2563eb]" />}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-6 rounded-2xl bg-stone-50 px-4 py-3 text-[13px] leading-5 text-stone-500 dark:bg-black/20 dark:text-stone-400">
        Your recording is sent directly from this browser to Azure Speech. It is not stored by
        ClearSpeak.
      </p>
    </section>
  );
}
