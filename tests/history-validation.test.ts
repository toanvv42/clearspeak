import { describe, expect, it } from "vitest";
import {
  validateAttemptCreate,
  validateAssessmentResult,
  validateEvaluationPayload,
} from "@/lib/history/validation";

describe("history validation", () => {
  it("accepts a minimal attempt payload and normalizes text", () => {
    const out = validateAttemptCreate({
      schemaVersion: 1,
      recordedAt: new Date().toISOString(),
      durationMs: 5000,
      stopReason: "manual",
      referenceText: "  She worked   hard. ",
      title: "Test",
      level: "B1.2",
      source: { kind: "custom", hash: "abc" },
      scope: "passage",
      locale: "en-US",
    });
    expect(out.referenceText).toBe("She worked hard.");
  });

  it("rejects bad durations, locales, and sources", () => {
    const good = {
      schemaVersion: 1,
      recordedAt: new Date().toISOString(),
      durationMs: 5000,
      stopReason: "manual",
      referenceText: "Hello world",
      title: null,
      level: null,
      source: { kind: "custom", hash: "abc" },
      scope: "passage",
      locale: "en-US",
    };
    expect(() => validateAttemptCreate({ ...good, durationMs: -1 })).toThrow();
    expect(() => validateAttemptCreate({ ...good, locale: "en-GB" })).toThrow();
    expect(() => validateAttemptCreate({ ...good, source: { kind: "custom" } })).toThrow();
  });

  it("validates score ranges and bounds nested sizes", () => {
    const result = {
      referenceText: "Hi",
      recognizedText: "Hi",
      pronunciationScore: 80,
      words: [],
      insertedWords: [],
    };
    expect(validateAssessmentResult(result).pronunciationScore).toBe(80);
    expect(() => validateAssessmentResult({ ...result, pronunciationScore: 101 })).toThrow();
    expect(() =>
      validateEvaluationPayload({
        evaluationId: "123",
        expectedRevision: 0,
        evaluatedAt: new Date().toISOString(),
        assessmentConfig: { provider: "azure", locale: "en-US" },
        result,
      }),
    ).toThrow();
  });
});
