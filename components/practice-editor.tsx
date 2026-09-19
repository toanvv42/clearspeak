"use client";

import { MAX_CHARS, MAX_WORDS, SAMPLE_TEXT, validatePassage } from "@/lib/text";

export default function PracticeEditor({
  draft,
  onDraftChange,
  onStart,
  disabled,
}: {
  draft: string;
  onDraftChange: (v: string) => void;
  onStart: (normalized: string) => void;
  disabled: boolean;
}) {
  const validation = validatePassage(draft);

  const listenToSample = () => {
    try {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const text = validation.normalized || draft;
      if (!text.trim()) return;
      const utter = new SpeechSynthesisUtterance(validation.normalized || draft.trim());
      utter.lang = "en-US";
      const voices = window.speechSynthesis.getVoices();
      const us = voices.find((v) => v.lang?.toLowerCase().startsWith("en-us"));
      if (us) utter.voice = us;
      window.speechSynthesis.speak(utter);
    } catch {
      /* ignore */
    }
  };

  return (
    <section aria-label="Practice text" className="rounded-2xl border border-[#e5ddcb] bg-white p-5 shadow-sm sm:p-6 dark:border-white/10 dark:bg-white/5">
      <label htmlFor="practice-text" className="text-base font-semibold">
        Your practice text
      </label>
      <textarea
        id="practice-text"
        value={draft}
        disabled={disabled}
        onChange={(e) => onDraftChange(e.target.value)}
        rows={5}
        maxLength={MAX_CHARS + 100}
        placeholder="Paste a short English passage (1–60 words)…"
        className="mt-3 min-h-32 w-full rounded-xl border border-[#d8cfb8] bg-[#fffdf8] px-4 py-3 text-lg leading-8 outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/30 disabled:opacity-60 dark:border-white/15 dark:bg-black/30"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm opacity-80">
        <p aria-live="polite">
          {validation.wordCount} {validation.wordCount === 1 ? "word" : "words"} ·{" "}
          {validation.charCount}/{MAX_CHARS} characters
        </p>
        <p className="hidden sm:block">Short passages keep recordings under 30 seconds.</p>
      </div>
      {validation.errors.length > 0 && draft.trim().length > 0 && (
        <ul className="mt-2 space-y-1" aria-live="polite">
          {validation.errors.map((e) => (
            <li key={e} className="text-sm text-amber-800 dark:text-amber-200">
              {e}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={disabled || !validation.valid}
          onClick={() => onStart(validation.normalized)}
          className="flex-1 rounded-xl bg-[#2563eb] px-5 py-3.5 text-base font-semibold text-white hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Start recording
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onDraftChange(SAMPLE_TEXT)}
          className="rounded-xl border border-[#d8cfb8] px-5 py-3.5 text-base font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
        >
          Use sample text
        </button>
        <button
          type="button"
          disabled={disabled || !draft.trim()}
          onClick={listenToSample}
          aria-label="Listen to sample using your browser voice"
          className="rounded-xl border border-[#d8cfb8] px-5 py-3.5 text-base font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
        >
          Listen to sample
        </button>
      </div>
      <p className="mt-3 text-xs leading-5 opacity-70">
        Max {MAX_WORDS} words and {MAX_CHARS} characters. Sample playback uses your browser voice and
        never touches Azure quota.
      </p>
    </section>
  );
}
