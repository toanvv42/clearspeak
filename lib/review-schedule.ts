import type { SourceIdentity } from "@/lib/history/types";

/** Tunable spaced-review intervals in days: tomorrow, three days, one week. */
export const REVIEW_INTERVAL_DAYS = [1, 3, 7] as const;
export const MAX_REVIEW_STEP = REVIEW_INTERVAL_DAYS.length - 1;

export type ReviewTarget =
  | { kind: "library"; id: string; version: number }
  | { kind: "custom"; hash: string };

export function reviewTargetKey(target: ReviewTarget): string {
  return target.kind === "library"
    ? `library:${target.id}:${target.version}`
    : `custom:${target.hash}`;
}

export function reviewTargetFromSource(source: SourceIdentity): ReviewTarget {
  return source.kind === "library"
    ? { kind: "library", id: source.id, version: source.version }
    : { kind: "custom", hash: source.hash };
}

export function parseReviewTargetKey(key: string): ReviewTarget | null {
  const library = key.match(/^library:(.+):(\d+)$/);
  if (library) return { kind: "library", id: library[1], version: Number(library[2]) };
  const custom = key.match(/^custom:(.+)$/);
  if (custom) return { kind: "custom", hash: custom[1] };
  return null;
}

/** Next due date after practising at `practicedAt` with the given step. */
export function nextDueAt(practicedAt: string, step: number): string {
  const clamped = Math.max(0, Math.min(MAX_REVIEW_STEP, step));
  const days = REVIEW_INTERVAL_DAYS[clamped];
  const at = Date.parse(practicedAt);
  const base = Number.isNaN(at) ? Date.now() : at;
  return new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
}

/** Advance one interval step, capped at the longest interval. */
export function advanceReviewStep(step: number): number {
  return Math.max(0, Math.min(MAX_REVIEW_STEP, step + 1));
}

/** A target is due when its due date has passed. Invalid dates count as due. */
export function isDue(nextDue: string, now: string = new Date().toISOString()): boolean {
  const due = Date.parse(nextDue);
  const current = Date.parse(now);
  if (Number.isNaN(due)) return true;
  if (Number.isNaN(current)) return false;
  return due <= current;
}

export type DueReviewItem = {
  targetKey: string;
  kind: ReviewTarget["kind"];
  title: string;
  passageId: string | null;
  passageVersion: number | null;
  latestAttemptId: string;
  lastPracticedAt: string;
  nextDueAt: string;
  intervalStep: number;
  practiceCount: number;
  lastScore: number | null;
};

export type TargetStats = {
  targetKey: string;
  title: string;
  attempts: number;
  first: { score: number | null; at: string } | null;
  latest: { score: number | null; at: string } | null;
  best: { score: number | null; at: string } | null;
};

export type WeeklyPracticeCount = {
  /** YYYY-MM-DD in UTC. */
  date: string;
  attempts: number;
};

export type FavouritePassage = {
  targetKey: string;
  passageId: string;
  passageVersion: number;
  title: string;
  createdAt: string;
};
