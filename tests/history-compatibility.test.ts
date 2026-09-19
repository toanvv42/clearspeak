import { describe, expect, it } from "vitest";
import { isCompatiblePair, pickPreviousAttempt } from "@/lib/history/compatibility";

function base(overrides: Record<string, unknown> = {}) {
  return {
    id: "id",
    referenceText: "She worked hard.",
    source: { kind: "custom" as const, hash: "abc" },
    scope: "passage" as const,
    locale: "en-US",
    evaluationState: "success" as const,
    stopReason: "manual" as const,
    recordedAt: "2026-09-19T10:00:00.000Z",
    ...overrides,
  };
}

describe("history compatibility", () => {
  it("requires exact normalized text and matching scope/locale/config", () => {
    const cur = base();
    const same = base({ id: "prev", recordedAt: "2026-09-18T10:00:00.000Z" });
    expect(isCompatiblePair(cur, same, "azure|en-US|prosody:0", "azure|en-US|prosody:0")).toBe(true);
    expect(
      isCompatiblePair({ ...cur, referenceText: "She  worked  hard." }, same, null, null),
    ).toBe(true);
    expect(
      isCompatiblePair({ ...cur, referenceText: "Different text" }, same, null, null),
    ).toBe(false);
    expect(isCompatiblePair(cur, { ...same, evaluationState: "failed" }, null, null)).toBe(false);
    expect(isCompatiblePair(cur, { ...same, stopReason: "limit" }, null, null)).toBe(false);
    expect(
      isCompatiblePair(cur, same, "azure|en-US|prosody:0", "azure|en-US|prosody:1"),
    ).toBe(false);
  });

  it("requires same library id/version and rejects changed config groups", () => {
    const cur = base({ source: { kind: "library", id: "a1-01", version: 2 } });
    const sameLib = base({
      id: "p",
      source: { kind: "library", id: "a1-01", version: 2 },
      recordedAt: "2026-09-18T10:00:00.000Z",
    });
    const diffVersion = base({
      id: "q",
      source: { kind: "library", id: "a1-01", version: 3 },
      recordedAt: "2026-09-17T10:00:00.000Z",
    });
    expect(isCompatiblePair(cur, sameLib, null, null)).toBe(true);
    expect(isCompatiblePair(cur, diffVersion, null, null)).toBe(false);
  });

  it("picks the most recent compatible take and skips limit takes", () => {
    const cur = { ...base({ id: "cur" }), assessmentConfigKey: "k", evaluationSchemaVersion: 1 };
    const old = { ...base({ id: "old", recordedAt: "2026-09-16T10:00:00.000Z" }), assessmentConfigKey: "k", evaluationSchemaVersion: 1 };
    const newer = { ...base({ id: "newer", recordedAt: "2026-09-18T10:00:00.000Z" }), assessmentConfigKey: "k", evaluationSchemaVersion: 1 };
    const picked = pickPreviousAttempt(cur, [old, newer], () => "k", () => 1);
    expect(picked?.id).toBe("newer");
    const limited = { ...cur, stopReason: "limit" as const };
    expect(pickPreviousAttempt(limited, [old, newer], () => "k", () => 1)).toBeNull();
  });
});
