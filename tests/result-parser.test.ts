import { describe, expect, it } from "vitest";
import { isWordOmitted, parsePronunciationJson } from "@/lib/azure/result-parser";

export const FULL_FIXTURE = JSON.stringify({
  NBest: [
    {
      Display: "She walked slowly.",
      PronunciationAssessment: {
        AccuracyScore: 82,
        FluencyScore: 90,
        CompletenessScore: 100,
        PronScore: 85,
        ProsodyScore: 77,
      },
      Words: [
        {
          Word: "she",
          Offset: 1000000,
          Duration: 2000000,
          PronunciationAssessment: { AccuracyScore: 95, ErrorType: "None" },
          Syllables: [
            {
              Syllable: "she",
              PronunciationAssessment: { AccuracyScore: 95, ErrorType: "None" },
              Offset: 1000000,
              Duration: 2000000,
            },
          ],
          Phonemes: [
            {
              Phoneme: "ʃ",
              PronunciationAssessment: {
                AccuracyScore: 95,
                NBestPhonemes: [{ Phoneme: "ʃ", Score: 95 }],
              },
            },
            {
              Phoneme: "i",
              PronunciationAssessment: {
                AccuracyScore: 96,
                NBestPhonemes: [{ Phoneme: "i", Score: 96 }],
              },
            },
          ],
        },
        {
          Word: "walked",
          PronunciationAssessment: { AccuracyScore: 55, ErrorType: "Mispronunciation" },
          Syllables: [],
          Phonemes: [
            {
              Phoneme: "w",
              PronunciationAssessment: {
                AccuracyScore: 90,
                NBestPhonemes: [{ Phoneme: "w", Score: 90 }],
              },
            },
            {
              Phoneme: "t",
              PronunciationAssessment: {
                AccuracyScore: 30,
                NBestPhonemes: [
                  { Phoneme: "d", Score: 60 },
                  { Phoneme: "t", Score: 30 },
                ],
              },
            },
          ],
        },
      ],
    },
  ],
});

describe("result parser", () => {
  it("parses a full result with prosody, syllables, phonemes, and N-best", () => {
    const r = parsePronunciationJson(FULL_FIXTURE, "She walked slowly.");
    expect(r.recognizedText).toBe("She walked slowly.");
    expect(r.pronunciationScore).toBe(85);
    expect(r.prosodyScore).toBe(77);
    expect(r.words).toHaveLength(2);
    expect(r.words[0].syllables).toHaveLength(1);
    expect(r.words[1].phonemes[1].alternatives[0]).toEqual({ symbol: "d", confidence: 60 });
    expect(r.words[1].phonemes[1].position).toBe("final");
    expect(r.words[1].phonemes[0].position).toBe("initial");
  });

  it("handles missing prosody gracefully", () => {
    const raw = JSON.stringify({
      NBest: [
        {
          Display: "Hi.",
          PronunciationAssessment: { AccuracyScore: 80, PronScore: 80 },
          Words: [],
        },
      ],
    });
    const r = parsePronunciationJson(raw, "Hi.");
    expect(r.prosodyScore).toBeUndefined();
    expect(r.fluencyScore).toBeUndefined();
  });

  it("keeps omitted words visible and flags them", () => {
    const raw = JSON.stringify({
      NBest: [
        {
          Display: "She slowly.",
          PronunciationAssessment: { PronScore: 60 },
          Words: [
            { Word: "she", PronunciationAssessment: { AccuracyScore: 90, ErrorType: "None" } },
            {
              Word: "walked",
              PronunciationAssessment: { AccuracyScore: 0, ErrorType: "Omission" },
              Phonemes: [{ Phoneme: "w", PronunciationAssessment: { AccuracyScore: 0 } }],
            },
          ],
        },
      ],
    });
    const r = parsePronunciationJson(raw, "She walked slowly.");
    expect(r.words).toHaveLength(2);
    expect(isWordOmitted(r.words[1])).toBe(true);
  });

  it("separates inserted words", () => {
    const raw = JSON.stringify({
      NBest: [
        {
          Display: "She um walked.",
          PronunciationAssessment: { PronScore: 70 },
          Words: [
            { Word: "she", PronunciationAssessment: { ErrorType: "None" } },
            { Word: "um", PronunciationAssessment: { ErrorType: "Insertion" } },
            { Word: "walked", PronunciationAssessment: { ErrorType: "None" } },
          ],
        },
      ],
    });
    const r = parsePronunciationJson(raw, "She walked.");
    expect(r.words.map((w) => w.text)).toEqual(["she", "walked"]);
    expect(r.insertedWords.map((w) => w.text)).toEqual(["um"]);
  });

  it("returns an empty result for malformed or missing fields", () => {
    expect(parsePronunciationJson("not json", "ref").words).toEqual([]);
    expect(parsePronunciationJson("{}", "ref").words).toEqual([]);
    expect(parsePronunciationJson('{"NBest":[]}', "ref").recognizedText).toBe("");
    expect(parsePronunciationJson('{"NBest":[42]}', "ref").words).toEqual([]);
  });

  it("reads N-best candidates from the nested PronunciationAssessment object", () => {
    // A sibling-level NBestPhonemes array is not a real Azure shape and is ignored.
    const raw = JSON.stringify({
      NBest: [
        {
          Display: "Hi.",
          PronunciationAssessment: { PronScore: 80 },
          Words: [
            {
              Word: "hi",
              PronunciationAssessment: { AccuracyScore: 80, ErrorType: "None" },
              Phonemes: [
                {
                  Phoneme: "h",
                  PronunciationAssessment: { AccuracyScore: 80 },
                  NBestPhonemes: [{ Phoneme: "h", Score: 80 }],
                },
              ],
            },
          ],
        },
      ],
    });
    const r = parsePronunciationJson(raw, "Hi.");
    expect(r.words[0].phonemes[0].alternatives).toEqual([]);
  });
});

/**
 * Documentation-faithful Azure shape: a weak final consonant whose
 * N-best candidates live under the phoneme's PronunciationAssessment.
 */
export const WEAK_FINAL_FIXTURE = JSON.stringify({
  NBest: [
    {
      Display: "She played.",
      PronunciationAssessment: {
        AccuracyScore: 78,
        FluencyScore: 88,
        CompletenessScore: 100,
        PronScore: 80,
      },
      Words: [
        {
          Word: "she",
          Offset: 500000,
          Duration: 2500000,
          PronunciationAssessment: { AccuracyScore: 92, ErrorType: "None" },
          Syllables: [
            {
              Syllable: "she",
              PronunciationAssessment: { AccuracyScore: 92, ErrorType: "None" },
              Offset: 500000,
              Duration: 2500000,
            },
          ],
          Phonemes: [
            {
              Phoneme: "ʃ",
              PronunciationAssessment: {
                AccuracyScore: 94,
                NBestPhonemes: [{ Phoneme: "ʃ", Score: 94 }],
              },
            },
            {
              Phoneme: "i",
              PronunciationAssessment: {
                AccuracyScore: 90,
                NBestPhonemes: [{ Phoneme: "i", Score: 90 }],
              },
            },
          ],
        },
        {
          Word: "played",
          Offset: 3200000,
          Duration: 4800000,
          PronunciationAssessment: { AccuracyScore: 48, ErrorType: "Mispronunciation" },
          Syllables: [
            {
              Syllable: "played",
              PronunciationAssessment: { AccuracyScore: 48, ErrorType: "Mispronunciation" },
              Offset: 3200000,
              Duration: 4800000,
            },
          ],
          Phonemes: [
            {
              Phoneme: "p",
              PronunciationAssessment: {
                AccuracyScore: 85,
                NBestPhonemes: [{ Phoneme: "p", Score: 85 }],
              },
            },
            {
              Phoneme: "l",
              PronunciationAssessment: {
                AccuracyScore: 82,
                NBestPhonemes: [{ Phoneme: "l", Score: 82 }],
              },
            },
            {
              Phoneme: "eɪ",
              PronunciationAssessment: {
                AccuracyScore: 80,
                NBestPhonemes: [{ Phoneme: "eɪ", Score: 80 }],
              },
            },
            {
              Phoneme: "d",
              PronunciationAssessment: {
                AccuracyScore: 28,
                NBestPhonemes: [
                  { Phoneme: "t", Score: 55 },
                  { Phoneme: "d", Score: 28 },
                ],
              },
            },
          ],
        },
      ],
    },
  ],
});
