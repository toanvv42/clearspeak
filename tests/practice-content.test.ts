import { describe, expect, it } from "vitest";
import {
  customTextIdentity,
  filterPassages,
  getPassageById,
  passageIdentity,
  LIBRARY_BAND_COUNTS,
  PRACTICE_BANDS,
  PRACTICE_PASSAGES,
  validatePracticePassages,
} from "@/lib/practice-content";

describe("practice content", () => {
  it("contains the complete, valid 44-passage library distribution", () => {
    expect(PRACTICE_PASSAGES).toHaveLength(44);
    expect(validatePracticePassages([...PRACTICE_PASSAGES])).toEqual([]);
    for (const band of PRACTICE_BANDS) {
      expect(PRACTICE_PASSAGES.filter((passage) => passage.band === band)).toHaveLength(
        LIBRARY_BAND_COUNTS[band],
      );
    }
  });

  it("derives exact chunk boundaries and display metadata", () => {
    for (const passage of PRACTICE_PASSAGES) {
      expect(passage.wordCount).toBeGreaterThan(0);
      expect(passage.estimatedSeconds).toBeGreaterThan(0);
      for (const chunk of passage.chunks) {
        expect(passage.text.slice(chunk.start, chunk.end)).toBe(chunk.text);
      }
    }
  });

  it("filters by band, topic, focus, and search query", () => {
    const b12 = filterPassages({ band: "B1.2" });
    expect(b12).toHaveLength(12);
    expect(b12.every((passage) => passage.band === "B1.2")).toBe(true);

    const workRequests = filterPassages({
      band: "B1.2",
      topic: "work-technology",
      focus: "request-intonation",
    });
    expect(workRequests.length).toBeGreaterThan(0);
    expect(workRequests.every((passage) => passage.focusTags.includes("request-intonation"))).toBe(true);

    expect(filterPassages({ query: "reusable bottle" }).map((passage) => passage.id)).toEqual([
      "b12-reusable-bottle",
    ]);
    expect(
      filterPassages({ query: "Final consonants" }).some((passage) =>
        passage.focusTags.includes("final-consonants"),
      ),
    ).toBe(true);
    expect(
      filterPassages({ query: "Work & technology" }).some(
        (passage) => passage.topic === "work-technology",
      ),
    ).toBe(true);
  });

  it("uses stable versioned identities and normalized custom hashes", () => {
    const passage = getPassageById("b12-project-details", 1);
    expect(passage).toBeDefined();
    expect(passageIdentity(passage!)).toEqual({
      kind: "library",
      id: "b12-project-details",
      version: 1,
    });
    expect(customTextIdentity("  My   own text. ")).toEqual(customTextIdentity("My own text."));
    expect(customTextIdentity(`${passage!.text} changed`)).not.toEqual(customTextIdentity(passage!.text));
  });
});
