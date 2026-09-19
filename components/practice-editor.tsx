"use client";

import { useEffect, useMemo, useState } from "react";
import PassageLibrary, { formatFocus } from "@/components/passage-library";
import type { PracticePassage } from "@/lib/practice-content";
import {
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
}: {
  draft: string;
  onDraftChange: (v: string) => void;
  onStart: (normalized: string) => void;
  disabled: boolean;
  selectedPassage: PracticePassage | null;
  onSelectPassage: (passage: PracticePassage) => void;
}) {
  const [showLibrary, setShowLibrary] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const validation = validatePassage(draft);
  const selectedVoice = useMemo(
    () => voices.find((voice) => voiceId(voice) === selectedVoiceId),
    [selectedVoiceId, voices],
  );

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const loadVoices = () => {
      const available = rankEnglishVoices(synth.getVoices());
      setVoices(available);
      setSelectedVoiceId((current) => {
        if (current && available.some((voice) => voiceId(voice) === current)) return current;
        let saved = "";
        try {
          saved = window.localStorage.getItem(REFERENCE_VOICE_STORAGE_KEY) ?? "";
        } catch {
          /* storage may be blocked */
        }
        if (saved && available.some((voice) => voiceId(voice) === saved)) return saved;
        const preferred = preferredEnglishVoice(available);
        return preferred ? voiceId(preferred) : "";
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
    <section aria-label="Practice text" className="rounded-2xl border border-[#e5ddcb] bg-white p-5 shadow-sm sm:p-6 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-base font-semibold">Choose what to practice</p>
          <p className="mt-1 text-xs opacity-70">Pick a graded text or paste your own below.</p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowLibrary((value) => !value)}
          aria-expanded={showLibrary}
          className="rounded-xl border border-[#d8cfb8] px-4 py-2.5 text-sm font-semibold hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
        >
          {showLibrary ? "Close library" : "Browse practice texts"}
        </button>
      </div>
      {showLibrary && (
        <PassageLibrary
          selectedId={selectedPassage?.id}
          onSelect={(passage) => {
            onSelectPassage(passage);
            setShowLibrary(false);
          }}
        />
      )}
      {selectedPassage && (
        <div className="mt-4 rounded-xl border border-[#2563eb]/25 bg-blue-50 px-4 py-3 text-sm dark:bg-blue-950/40">
          <p className="font-semibold">{selectedPassage.title} · {selectedPassage.band}</p>
          <p className="mt-1 text-xs opacity-75">
            {selectedPassage.focusTags.map(formatFocus).join(" · ")} · {selectedPassage.source.attribution}
          </p>
        </div>
      )}
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
      <div className="mt-4 rounded-xl border border-black/10 p-3 dark:border-white/10">
        <label htmlFor="reference-voice" className="text-sm font-semibold">
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
          className="mt-1 block w-full rounded-lg border border-[#d8cfb8] bg-[#fffdf8] px-3 py-2 text-sm outline-none focus:border-[#2563eb] dark:border-white/15 dark:bg-black/30"
        >
          {voices.length === 0 && <option value="">No English browser voices found</option>}
          {voices.map((voice) => (
            <option key={voiceId(voice)} value={voiceId(voice)}>
              {voice.name} ({voice.lang}){isGoogleUsEnglishVoice(voice) ? " — preferred" : ""}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs opacity-65" aria-live="polite">
          {selectedVoice && isGoogleUsEnglishVoice(selectedVoice)
            ? "Using Google US English from Chrome."
            : "Chrome only lets this app use voices shown in this list."}
        </p>
      </div>
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
