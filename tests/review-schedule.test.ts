import { describe, expect, it } from "vitest";
import {
  advanceReviewStep,
  isDue,
  MAX_REVIEW_STEP,
  nextDueAt,
  parseReviewTargetKey,
  REVIEW_INTERVAL_DAYS,
  reviewTargetFromSource,
  reviewTargetKey,
} from "@/lib/review-schedule";

describe("review schedule", () => {
  it("uses tomorrow, three days, and one week as tunable defaults", () => {
    expect([...REVIEW_INTERVAL_DAYS]).toEqual([1, 3, 7]);
  });

  it("builds stable target keys from attempt sources", () => {
    expect(reviewTargetKey({ kind: "library", id: "b12-01", version: 2 })).toBe("library:b12-01:2");
    expect(reviewTargetKey({ kind: "custom", hash: "abc" })).toBe("custom:abc");
    expect(reviewTargetFromSource({ kind: "library", id: "b12-01", version: 2 })).toEqual({
      kind: "library",
      id: "b12-01",
      version: 2,
    });
    expect(parseReviewTargetKey("library:b12-01:2")).toEqual({ kind: "library", id: "b12-01", version: 2 });
    expect(parseReviewTargetKey("custom:abc")).toEqual({ kind: "custom", hash: "abc" });
    expect(parseReviewTargetKey("bogus")).toBeNull();
  });

  it("schedules the next review one interval ahead", () => {
    expect(nextDueAt("2026-09-19T10:00:00.000Z", 0)).toBe("2026-09-20T10:00:00.000Z");
    expect(nextDueAt("2026-09-19T10:00:00.000Z", 1)).toBe("2026-09-22T10:00:00.000Z");
    expect(nextDueAt("2026-09-19T10:00:00.000Z", 2)).toBe("2026-09-26T10:00:00.000Z");
    expect(nextDueAt("2026-09-19T10:00:00.000Z", 99)).toBe("2026-09-26T10:00:00.000Z");
  });

  it("caps the interval step at the longest interval", () => {
    expect(advanceReviewStep(0)).toBe(1);
    expect(advanceReviewStep(MAX_REVIEW_STEP)).toBe(MAX_REVIEW_STEP);
    expect(advanceReviewStep(99)).toBe(MAX_REVIEW_STEP);
  });

  it("marks overdue targets as due, invalid dates included", () => {
    expect(isDue("2026-09-20T00:00:00.000Z", "2026-09-21T00:00:00.000Z")).toBe(true);
    expect(isDue("2026-09-22T00:00:00.000Z", "2026-09-21T00:00:00.000Z")).toBe(false);
    expect(isDue("not-a-date")).toBe(true);
  });
});
