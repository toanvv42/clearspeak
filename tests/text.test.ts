import { describe, expect, it } from "vitest";
import {
  countWords,
  normalizeText,
  SAMPLE_TEXT,
  stripPunctuation,
  tokenizeReference,
  validatePassage,
} from "@/lib/text";

describe("text utils", () => {
  it("normalizes surrounding whitespace but preserves punctuation", () => {
    expect(normalizeText("  Hello,   world!  \nNew line. ")).toBe("Hello, world! New line.");
  });

  it("counts words", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("Hello, world!")).toBe(2);
  });

  it("sample text is 25–35 words", () => {
    const n = countWords(normalizeText(SAMPLE_TEXT));
    expect(n).toBeGreaterThanOrEqual(25);
    expect(n).toBeLessThanOrEqual(35);
  });

  it("accepts a valid short passage", () => {
    const v = validatePassage("Hello world, this is a test.");
    expect(v.valid).toBe(true);
    expect(v.wordCount).toBe(6);
    expect(v.errors).toEqual([]);
  });

  it("rejects empty passages", () => {
    const v = validatePassage("   ");
    expect(v.valid).toBe(false);
    expect(v.errors.length).toBeGreaterThan(0);
  });

  it("rejects more than 60 words and explains the 30-second reason", () => {
    const v = validatePassage(Array(61).fill("word").join(" "));
    expect(v.valid).toBe(false);
    expect(v.errors.join(" ")).toMatch(/30 seconds/);
  });

  it("rejects more than 600 characters", () => {
    const v = validatePassage(`${"a".repeat(601)}`);
    expect(v.valid).toBe(false);
  });

  it("tokenizes while preserving punctuation", () => {
    expect(tokenizeReference("Hello, world! How's it going?")).toEqual([
      "Hello,",
      "world!",
      "How's",
      "it",
      "going?",
    ]);
  });

  it("strips surrounding punctuation but keeps internal apostrophes", () => {
    expect(stripPunctuation("“Hello,”")).toBe("Hello");
    expect(stripPunctuation("How's")).toBe("How's");
    expect(stripPunctuation("end.")).toBe("end");
  });
});
