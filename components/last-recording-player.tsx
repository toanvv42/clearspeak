"use client";

export default function LastRecordingPlayer({ audioUrl, label = "Replay your last recording", hint }: { audioUrl: string; label?: string; hint?: string }) {
  return (
    <section
      aria-label="Last recording"
      className="rounded-3xl border border-stone-200 bg-white p-5 shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.04]"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm dark:bg-white/10">↺</span>
        <div>
          <h3 className="text-[15px] font-extrabold tracking-tight">{label}</h3>
          <p className="text-[13px] text-stone-500 dark:text-stone-400">
            {hint ?? "Only the latest take is kept in this tab."}
          </p>
        </div>
      </div>
      <audio
        controls
        preload="metadata"
        src={audioUrl}
        className="mt-4 w-full"
        aria-label="Your last recording playback"
      />
    </section>
  );
}
