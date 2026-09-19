"use client";

import { useEffect, useMemo, useState } from "react";
import PassageLibrary, { formatFocus } from "@/components/passage-library";
import type { PassageFilterState, PracticePassage } from "@/lib/practice-content";
import {
  chooseReferenceVoice,
  isGoogleUsEnglishVoice,
  preferredEnglishVoice,
  rankEnglishVoices,
  REFERENCE_VOICE_STORAGE_KEY,
  voiceId,
} from "@/lib/reference-voice";
import { MAX_CHARS, MAX_WORDS, validatePassage } from "@/lib/text";

export default function PracticeEditor({
  draft,
  onDraftChange,
  onStart,
  disabled,
  selectedPassage,
  onSelectPassage,
  libraryFilters,
  onLibraryFiltersChange,
  hideLibraryBrowser = false,
}: {
  draft: string;
  onDraftChange: (v: string) => void;
  onStart: (normalized: string) => void;
  disabled: boolean;
  selectedPassage: PracticePassage | null;
  onSelectPassage: (passage: PracticePassage) => void;
  libraryFilters: PassageFilterState;
  onLibraryFiltersChange: (filters: PassageFilterState) => void;
  hideLibraryBrowser?: boolean;
}) {
  const [showLibrary, setShowLibrary] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const validation = validatePassage(draft);
  const selectedVoice = useMemo(
    () => voices.find((voice) => voiceId(voice) === selectedVoiceId),
    [selectedVoiceId, voices],
  );
  const wordPct = Math.min(100, (validation.wordCount / MAX_WORDS) * 100);
  const overWord = validation.wordCount > MAX_WORDS;

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const loadVoices = () => {
      const available = rankEnglishVoices(synth.getVoices());
      setVoices(available);
      setSelectedVoiceId((current) => {
        let saved = "";
        try {
          saved = window.localStorage.getItem(REFERENCE_VOICE_STORAGE_KEY) ?? "";
        } catch {
          /* storage may be blocked */
        }
        const chosen = chooseReferenceVoice(available, current, saved);
        return chosen ? voiceId(chosen) : "";
      });
    };

    loadVoices();
    synth.addEventListener?.("voiceschanged", loadVoices);
    return () => synth.removeEventListener?.("voiceschanged", loadVoices);
  }, []);

  const listenToSample = () => {
    try {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const text = validation.normalized || draft;
      if (!text.trim()) return;
      const utter = new SpeechSynthesisUtterance(validation.normalized || draft.trim());
      utter.lang = "en-US";
      const voice = selectedVoice ?? preferredEnglishVoice(window.speechSynthesis.getVoices());
      if (voice) utter.voice = voice;
      window.speechSynthesis.speak(utter);
    } catch {
      /* ignore */
    }
  };

  return (
    <section aria-label="Practice text" className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-4 sm:px-6 dark:border-white/10">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white dark:bg-white dark:text-stone-900">1</span>
          <div>
            <p className="text-[15px] font-bold tracking-tight">Choose what to practice</p>
            <p className="text-xs text-stone-500 dark:text-stone-400">{hideLibraryBrowser ? "Paste your own or pick a sample from the library." : "Pick a graded text or paste your own below."}</p>
          </div>
        </div>
        {!hideLibraryBrowser && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowLibrary((value) => !value)}
          aria-expanded={showLibrary}
          className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold transition hover:border-stone-400 hover:bg-stone-50 active:scale-[0.99] disabled:opacity-50 dark:border-white/15 dark:bg-transparent dark:hover:bg-white/10"
        >
          {showLibrary ? "Close library" : "Browse practice texts"}
        </button>
        )}
      </div>

      <div className="px-5 py-5 sm:px-6 sm:py-6">
        {!hideLibraryBrowser && showLibrary && (
          <div className="rise-in mb-5">
            <PassageLibrary
              selectedId={selectedPassage?.id}
              filters={libraryFilters}
              onFiltersChange={onLibraryFiltersChange}
              onSelect={(passage) => {
                onSelectPassage(passage);
                setShowLibrary(false);
              }}
            />
          </div>
        )}
        {selectedPassage && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#2563eb]/20 bg-blue-50/70 px-4 py-3 text-sm dark:bg-blue-950/30">
            <span aria-hidden="true" className="mt-0.5 text-base">✓</span>
            <div className="min-w-0">
              <p className="font-bold tracking-tight">{selectedPassage.title} · {selectedPassage.band}</p>
              <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">
                {selectedPassage.focusTags.map(formatFocus).join(" · ")} · {selectedPassage.source.attribution}
              </p>
            </div>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="practice-text" className="text-[15px] font-bold tracking-tight">
            Your practice text
          </label>
          {draft.trim() && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onDraftChange("")}
              className="text-xs font-semibold text-stone-500 underline underline-offset-2 hover:text-stone-800 disabled:opacity-50 dark:text-stone-400 dark:hover:text-stone-200"
            >
              Clear
            </button>
          )}
        </div>
        <textarea
          id="practice-text"
          value={draft}
          disabled={disabled}
          onChange={(e) => onDraftChange(e.target.value)}
          rows={5}
          maxLength={MAX_CHARS + 100}
          placeholder="Paste a short English passage (1–60 words)…"
          className="mt-3 min-h-32 w-full resize-y rounded-2xl border border-stone-300 bg-[#fffdf8] px-4 py-3 text-[17px] leading-8 shadow-[inset_0_1px_2px_rgb(0_0_0/0.04)] outline-none transition placeholder:text-stone-400 focus:border-[#2563eb] focus:ring-4 focus:ring-[#2563eb]/15 disabled:opacity-60 dark:border-white/15 dark:bg-black/30 dark:placeholder:text-stone-500"
        />
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-stone-500 dark:text-stone-400">
            <p aria-live="polite" className="tabular-nums">
              <span className={`font-bold ${overWord ? "text-red-700 dark:text-red-300" : "text-stone-700 dark:text-stone-200"}`}>
                {validation.wordCount} {validation.wordCount === 1 ? "word" : "words"}
              </span>{" "}
              · {validation.charCount}/{MAX_CHARS} characters
            </p>
            <p className="hidden sm:block">Short passages keep recordings under 30 seconds.</p>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-stone-200/80 dark:bg-white/10" aria-hidden="true">
            <div
              className={`h-full rounded-full transition-all ${overWord ? "bg-red-600" : wordPct > 85 ? "bg-amber-500" : "bg-stone-900 dark:bg-white"}`}
              style={{ width: `${Math.min(100, wordPct)}%` }}
            />
          </div>
        </div>
        {validation.errors.length > 0 && draft.trim().length > 0 && (
          <ul className="mt-3 space-y-1 rounded-2xl border border-amber-600/25 bg-amber-50/70 px-4 py-3" aria-live="polite">
            {validation.errors.map((e) => (
              <li key={e} className="text-[13px] font-medium text-amber-900 dark:text-amber-200">
                {e}
              </li>
            ))}
          </ul>
        )}
        <details className="group mt-4 rounded-2xl border border-stone-200 bg-stone-50/60 dark:border-white/10 dark:bg-black/20">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <span aria-hidden="true">🔊</span> Reference voice
              <span className="rounded-full bg-stone-200/80 px-2 py-0.5 text-[11px] font-bold text-stone-600 dark:bg-white/10 dark:text-stone-300">
                {selectedVoice ? "set" : "auto"}
              </span>
            </span>
            <span aria-hidden="true" className="text-stone-400 transition group-open:rotate-180">▾</span>
          </summary>
          <div className="border-t border-stone-200 px-4 py-3 dark:border-white/10">
            <label htmlFor="reference-voice" className="sr-only">
              Reference voice
            </label>
            <select
              id="reference-voice"
              value={selectedVoiceId}
              disabled={disabled || voices.length === 0}
              onChange={(event) => {
                const value = event.target.value;
                setSelectedVoiceId(value);
                try {
                  window.localStorage.setItem(REFERENCE_VOICE_STORAGE_KEY, value);
                } catch {
                  /* storage may be blocked */
                }
              }}
              className="block w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#2563eb] dark:border-white/15 dark:bg-black/30"
            >
              {voices.length === 0 && <option value="">No English browser voices found</option>}
              {voices.map((voice) => (
                <option key={voiceId(voice)} value={voiceId(voice)}>
                  {voice.name} ({voice.lang}){isGoogleUsEnglishVoice(voice) ? " — preferred" : ""}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-5 text-stone-500 dark:text-stone-400" aria-live="polite">
              {selectedVoice && isGoogleUsEnglishVoice(selectedVoice)
                ? "Using Google US English from Chrome."
                : "Chrome only lets this app use voices shown in this list."}
            </p>
          </div>
        </details>
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
          <button
            type="button"
            disabled={disabled || !validation.valid}
            onClick={() => onStart(validation.normalized)}
            className="group flex flex-1 items-center justify-center gap-2 rounded-2xl bg-stone-900 px-5 py-3.5 text-[15px] font-bold text-white shadow-sm transition hover:bg-stone-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"
          >
            <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 transition group-enabled:group-hover:scale-110 dark:bg-stone-900/10">
              <span className="h-2 w-2 rounded-full bg-current" />
            </span>
            Start recording
          </button>
          <button
            type="button"
            disabled={disabled || !draft.trim()}
            onClick={listenToSample}
            aria-label="Listen to sample using your browser voice"
            className="flex items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white px-5 py-3.5 text-[15px] font-semibold transition hover:bg-stone-50 active:scale-[0.99] disabled:opacity-50 dark:border-white/15 dark:bg-transparent dark:hover:bg-white/10"
          >
            <span aria-hidden="true">▶</span>
            Listen to sample
          </button>
        </div>
        <p className="mt-3 text-center text-xs leading-5 text-stone-500 sm:text-left dark:text-stone-400">
          Max {MAX_WORDS} words and {MAX_CHARS} characters. Sample playback uses your browser voice and
          never touches Azure quota.
        </p>
      </div>
    </section>
  );
}
