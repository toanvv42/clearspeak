import { describe, expect, it } from "vitest";
import { alignReferenceWords } from "@/lib/alignment";
import type { AssessedWord } from "@/lib/types";

function word(text: string, accuracyScore = 85, errorType = "None"): AssessedWord {
  return { text, accuracyScore, errorType, syllables: [], phonemes: [] };
}

describe("alignReferenceWords", () => {
  it("aligns repeated words to the correct occurrence in order", () => {
    const { tokens, extraWords } = alignReferenceWords("the cat and the dog", [
      word("the", 55, "Mispronunciation"),
      word("cat"),
      word("and"),
      word("the", 95),
      word("dog"),
    ]);
    // The weak first "the" must attach to the first occurrence, not the second.
    expect(tokens[0].word?.accuracyScore).toBe(55);
    expect(tokens[3].word?.accuracyScore).toBe(95);
    expect(tokens.map((t) => t.word?.text ?? null)).toEqual(["the", "cat", "and", "the", "dog"]);
    expect(extraWords).toEqual([]);
  });

  it("leaves a fully missing repeated word visible without stealing later scores", () => {
    // Second "the" absent from Azure results entirely.
    const { tokens, extraWords } = alignReferenceWords("the cat and the dog", [
      word("the", 90),
      word("cat"),
      word("and"),
      word("dog", 88),
    ]);
    expect(tokens[3].word).toBeNull();
    expect(tokens[4].word?.text).toBe("dog");
    expect(tokens[4].word?.accuracyScore).toBe(88);
    expect(extraWords).toEqual([]);
  });

  it("does not attach a later repeated word to a missing first occurrence", () => {
    // First "the" absent from Azure results entirely. Greedy look-ahead used
    // to steal the later occurrence and break every alignment around it.
    const { tokens, extraWords } = alignReferenceWords("the cat and the dog", [
      word("cat"),
      word("and"),
      word("the", 96),
      word("dog"),
    ]);
    expect(tokens.map((t) => t.word?.text ?? null)).toEqual([null, "cat", "and", "the", "dog"]);
    expect(tokens[3].word?.accuracyScore).toBe(96);
    expect(extraWords).toEqual([]);
  });

  it("preserves explicitly omitted words on their own token", () => {
    const { tokens } = alignReferenceWords("the cat and the dog", [
      word("the", 90),
      word("cat"),
      word("and"),
      word("the", 0, "Omission"),
      word("dog", 88),
    ]);
    expect(tokens[3].word?.errorType).toBe("Omission");
    expect(tokens[4].word?.text).toBe("dog");
  });

  it("reports assessed words matching no token as extras", () => {
    const { tokens, extraWords } = alignReferenceWords("cat dog", [
      word("cat"),
      word("um"),
      word("dog"),
    ]);
    expect(tokens.map((t) => t.word?.text ?? null)).toEqual(["cat", "dog"]);
    expect(extraWords.map((w) => w.text)).toEqual(["um"]);
  });

  it("preserves punctuation in display tokens", () => {
    const { tokens } = alignReferenceWords("Hello, world!", [word("Hello", 90), word("world", 80)]);
    expect(tokens.map((t) => t.display)).toEqual(["Hello,", "world!"]);
    expect(tokens[0].word?.text).toBe("Hello");
  });
});
