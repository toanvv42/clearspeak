"use client";

import { useMemo, useState } from "react";
import {
  filterPassages,
  FOCUS_TAGS,
  PASSAGE_TOPICS,
  PRACTICE_BANDS,
  type FocusTag,
  type PassageTopic,
  type PracticeBand,
  type PracticePassage,
} from "@/lib/practice-content";

const TOPIC_LABELS: Record<PassageTopic, string> = {
  "daily-life": "Daily life",
  travel: "Travel",
  "work-technology": "Work & technology",
  relationships: "Relationships",
  "health-habits": "Health & habits",
  "science-environment": "Science & environment",
};

export function formatFocus(tag: FocusTag): string {
  return tag.replaceAll("-", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export default function PassageLibrary({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (passage: PracticePassage) => void;
}) {
  const [band, setBand] = useState<PracticeBand | "all">("B1.2");
  const [topic, setTopic] = useState<PassageTopic | "all">("all");
  const [focus, setFocus] = useState<FocusTag | "all">("all");
  const [query, setQuery] = useState("");
  const passages = useMemo(
    () => filterPassages({ band, topic, focus, query }),
    [band, topic, focus, query],
  );

  return (
    <section aria-label="Practice text library" className="mt-4 rounded-xl border border-[#d8cfb8] bg-[#faf7f1] p-4 dark:border-white/15 dark:bg-black/20">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-bold">Browse practice texts</h2>
          <p className="mt-1 text-xs opacity-70">Levels are ClearSpeak practice estimates, not placement results.</p>
        </div>
        <span className="rounded-full bg-[#2563eb]/10 px-2.5 py-1 text-xs font-semibold text-[#1d4ed8] dark:text-blue-200">
          {passages.length} {passages.length === 1 ? "text" : "texts"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">
          Search
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Title, text, or focus"
            className="mt-1 block w-full rounded-lg border border-[#d8cfb8] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#2563eb] dark:border-white/15 dark:bg-black/30"
          />
        </label>
        <label className="text-xs font-semibold">
          Practice level
          <select
            value={band}
            onChange={(event) => setBand(event.target.value as PracticeBand | "all")}
            className="mt-1 block w-full rounded-lg border border-[#d8cfb8] bg-white px-3 py-2 text-sm font-normal dark:border-white/15 dark:bg-black/30"
          >
            <option value="all">All levels</option>
            {PRACTICE_BANDS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">
          Topic
          <select
            value={topic}
            onChange={(event) => setTopic(event.target.value as PassageTopic | "all")}
            className="mt-1 block w-full rounded-lg border border-[#d8cfb8] bg-white px-3 py-2 text-sm font-normal dark:border-white/15 dark:bg-black/30"
          >
            <option value="all">All topics</option>
            {PASSAGE_TOPICS.map((value) => <option key={value} value={value}>{TOPIC_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">
          Pronunciation focus
          <select
            value={focus}
            onChange={(event) => setFocus(event.target.value as FocusTag | "all")}
            className="mt-1 block w-full rounded-lg border border-[#d8cfb8] bg-white px-3 py-2 text-sm font-normal dark:border-white/15 dark:bg-black/30"
          >
            <option value="all">All focuses</option>
            {FOCUS_TAGS.map((value) => <option key={value} value={value}>{formatFocus(value)}</option>)}
          </select>
        </label>
      </div>

      {passages.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-black/20 p-4 text-center text-sm dark:border-white/20">
          No texts match these filters.
        </p>
      ) : (
        <ul className="mt-4 max-h-[32rem] space-y-3 overflow-y-auto pr-1">
          {passages.map((passage) => {
            const selected = selectedId === passage.id;
            return (
              <li key={passage.id}>
                <article className={`rounded-xl border bg-white p-4 dark:bg-white/5 ${selected ? "border-[#2563eb] ring-2 ring-[#2563eb]/20" : "border-black/10 dark:border-white/10"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{passage.title}</h3>
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-semibold dark:bg-white/10">{passage.band}</span>
                    <span className="text-xs opacity-65">{TOPIC_LABELS[passage.topic]}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6">{passage.text}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-70">
                    <span>{passage.wordCount} words</span>
                    <span>about {passage.estimatedSeconds} sec</span>
                    <span>{passage.focusTags.map(formatFocus).join(" · ")}</span>
                    <span>{passage.source.attribution}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelect(passage)}
                    aria-pressed={selected}
                    className="mt-3 rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
                  >
                    {selected ? "Selected" : "Use this text"}
                  </button>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
