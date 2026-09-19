"use client";

import { useMemo } from "react";
import {
  filterPassages,
  FOCUS_TAGS,
  PASSAGE_TOPICS,
  PRACTICE_BANDS,
  type FocusTag,
  type PassageFilterState,
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
  filters,
  onFiltersChange,
  className = "",
}: {
  selectedId?: string;
  onSelect: (passage: PracticePassage) => void;
  filters: PassageFilterState;
  onFiltersChange: (filters: PassageFilterState) => void;
  className?: string;
}) {
  const passages = useMemo(
    () => filterPassages(filters),
    [filters],
  );
  const hasActiveFilters =
    filters.query.trim() !== "" || filters.band !== "all" || filters.topic !== "all" || filters.focus !== "all";

  return (
    <section aria-label="Practice text library" className={`rounded-2xl border border-stone-200 bg-[#faf9f6] p-4 shadow-[var(--shadow-card)] sm:p-5 dark:border-white/10 dark:bg-black/20 ${className || "mt-4"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">Browse practice texts</h2>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">Levels are ClearSpeak practice estimates, not placement results.</p>
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => onFiltersChange({ query: "", band: "all", topic: "all", focus: "all" })}
              className="rounded-full px-2.5 py-1 text-xs font-semibold text-stone-500 underline underline-offset-2 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
            >
              Clear all
            </button>
          )}
          <span className="rounded-full bg-stone-900 px-2.5 py-1 text-xs font-bold tabular-nums text-white dark:bg-white dark:text-stone-900">
            {passages.length} {passages.length === 1 ? "text" : "texts"}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <label className="text-xs font-bold">
          <span className="mb-1 block text-stone-600 dark:text-stone-300">Search</span>
          <input
            type="search"
            value={filters.query}
            onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })}
            placeholder="Title, text, or focus"
            className="block w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-normal shadow-[inset_0_1px_2px_rgb(0_0_0/0.04)] outline-none transition placeholder:text-stone-400 focus:border-[#2563eb] focus:ring-4 focus:ring-[#2563eb]/15 dark:border-white/15 dark:bg-black/30"
          />
        </label>
        <label className="text-xs font-bold">
          <span className="mb-1 block text-stone-600 dark:text-stone-300">Practice level</span>
          <select
            value={filters.band}
            onChange={(event) =>
              onFiltersChange({ ...filters, band: event.target.value as PracticeBand | "all" })
            }
            className="block w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#2563eb] dark:border-white/15 dark:bg-black/30"
          >
            <option value="all">All levels</option>
            {PRACTICE_BANDS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold">
          <span className="mb-1 block text-stone-600 dark:text-stone-300">Topic</span>
          <select
            value={filters.topic}
            onChange={(event) =>
              onFiltersChange({ ...filters, topic: event.target.value as PassageTopic | "all" })
            }
            className="block w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#2563eb] dark:border-white/15 dark:bg-black/30"
          >
            <option value="all">All topics</option>
            {PASSAGE_TOPICS.map((value) => <option key={value} value={value}>{TOPIC_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold">
          <span className="mb-1 block text-stone-600 dark:text-stone-300">Pronunciation focus</span>
          <select
            value={filters.focus}
            onChange={(event) =>
              onFiltersChange({ ...filters, focus: event.target.value as FocusTag | "all" })
            }
            className="block w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#2563eb] dark:border-white/15 dark:bg-black/30"
          >
            <option value="all">All focuses</option>
            {FOCUS_TAGS.map((value) => <option key={value} value={value}>{formatFocus(value)}</option>)}
          </select>
        </label>
      </div>

      {passages.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-6 text-center dark:border-white/20">
          <p className="text-sm font-semibold">No texts match these filters.</p>
          <button
            type="button"
            onClick={() => onFiltersChange({ query: "", band: "all", topic: "all", focus: "all" })}
            className="mt-2 text-sm font-semibold text-[#2563eb] underline underline-offset-2"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <ul className="nice-scroll mt-4 max-h-[28rem] space-y-2.5 overflow-y-auto pr-1">
          {passages.map((passage) => {
            const selected = selectedId === passage.id;
            return (
              <li key={passage.id}>
                <article className={`group rounded-2xl border bg-white p-4 transition hover:shadow-[var(--shadow-lift)] dark:bg-white/[0.04] ${selected ? "border-[#2563eb] ring-4 ring-[#2563eb]/15" : "border-stone-200 hover:border-stone-300 dark:border-white/10"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-bold tracking-tight">{passage.title}</h3>
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-stone-700 dark:bg-white/10 dark:text-stone-200">{passage.band}</span>
                    <span className="text-xs text-stone-500 dark:text-stone-400">{TOPIC_LABELS[passage.topic]}</span>
                    {selected && (
                      <span className="ml-auto rounded-full bg-[#2563eb] px-2 py-0.5 text-[11px] font-bold text-white">✓ Selected</span>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-stone-700 dark:text-stone-200">{passage.text}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                    <span className="tabular-nums">{passage.wordCount} words</span>
                    <span className="tabular-nums">about {passage.estimatedSeconds} sec</span>
                    <span>{passage.focusTags.map(formatFocus).join(" · ")}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelect(passage)}
                    aria-pressed={selected}
                    className={`mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-bold transition active:scale-[0.99] sm:w-auto ${selected ? "bg-stone-100 text-stone-700 dark:bg-white/10 dark:text-stone-200" : "bg-stone-900 text-white hover:bg-stone-700 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"}`}
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
