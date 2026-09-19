"use client";

export default function LastRecordingPlayer({ audioUrl }: { audioUrl: string }) {
  return (
    <section
      aria-label="Last recording"
      className="rounded-2xl border border-[#2563eb]/25 bg-blue-50/70 p-5 shadow-sm dark:bg-blue-950/30"
    >
      <h3 className="text-base font-bold">Replay your last recording</h3>
      <p className="mt-1 text-sm opacity-75">
        Listen again before your next attempt. Only the latest recording is kept in this browser
        tab, and it is replaced when you start recording again.
      </p>
      <audio
        controls
        preload="metadata"
        src={audioUrl}
        className="mt-3 w-full"
        aria-label="Your last recording playback"
      />
    </section>
  );
}
