"use client";

const STEPS = ["Preparing audio", "Securely connecting", "Assessing speech"];

export default function AnalyzingState({ step }: { step: number }) {
  return (
    <section
      aria-label="Analyzing"
      className="rounded-2xl border border-[#e5ddcb] bg-white p-5 shadow-sm sm:p-6 dark:border-white/10 dark:bg-white/5"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[#2563eb] border-t-transparent"
        />
        <h2 className="text-lg font-semibold">Analyzing your pronunciation…</h2>
      </div>
      <ol className="mt-4 space-y-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-3 text-sm">
            <span
              aria-hidden="true"
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                i < step
                  ? "bg-green-700 text-white"
                  : i === step
                    ? "bg-[#2563eb] text-white"
                    : "bg-black/10 dark:bg-white/10"
              }`}
            >
              {i < step ? "✓" : i + 1}
            </span>
            <span className={i <= step ? "font-medium" : "opacity-60"}>
              {label}
              {i === step && <span className="sr-only"> (in progress)</span>}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm opacity-70">
        Your recording is sent directly from this browser to Azure Speech. It is not stored by
        ClearSpeak.
      </p>
    </section>
  );
}
