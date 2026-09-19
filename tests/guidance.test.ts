import { describe, expect, it } from "vitest";
import {
  describeFinalPhoneme,
  endingSoundAlerts,
  formatScore,
  overallLabel,
  soundsToFix,
  weakestMetric,
} from "@/lib/assessment-guidance";
import { parsePronunciationJson } from "@/lib/azure/result-parser";
import { phonemePosition } from "@/lib/azure/result-parser";
import type { AssessmentResult } from "@/lib/types";
import { FULL_FIXTURE, WEAK_FINAL_FIXTURE } from "@/tests/result-parser.test";

function makeResult(overrides: Partial<AssessmentResult> = {}): AssessmentResult {
  return {
    referenceText: "She walked.",
    recognizedText: "She walked.",
    pronunciationScore: 85,
    accuracyScore: 70,
    fluencyScore: 90,
    completenessScore: 100,
    words: [],
    insertedWords: [],
    ...overrides,
  };
}

describe("guidance", () => {
  it("positions phonemes from array order", () => {
    expect(phonemePosition(0, 1)).toBe("only");
    expect(phonemePosition(0, 3)).toBe("initial");
    expect(phonemePosition(1, 3)).toBe("medial");
    expect(phonemePosition(2, 3)).toBe("final");
  });

  it("labels overall scores at thresholds", () => {
    expect(overallLabel(95)).toBe("Excellent");
    expect(overallLabel(85)).toBe("Good");
    expect(overallLabel(70)).toBe("Getting there");
    expect(overallLabel(30)).toBe("Needs practice");
    expect(overallLabel(undefined)).toBe("No score");
  });

  it("never displays NaN/undefined for missing scores", () => {
    expect(formatScore(undefined)).toBe("—");
    expect(formatScore(NaN)).toBe("—");
    expect(formatScore(82.35)).toBe("82.3");
  });

  it("picks the weakest metric deterministically", () => {
    const w = weakestMetric(makeResult());
    expect(w.key).toBe("accuracy");
    expect(w.suggestion).toMatch(/Accuracy/);
  });

  it("ignores missing prosody when choosing the weakest metric", () => {
    const w = weakestMetric(makeResult({ accuracyScore: 90, fluencyScore: 91, completenessScore: 92 }));
    expect(w.key).toBe("accuracy");
  });

  it("ranks the weakest sounds and groups repeats", () => {
    const r = parsePronunciationJson(FULL_FIXTURE, "She walked slowly.");
    // add a second weak /t/ so grouping can be observed
    r.words.push({
      text: "softly",
      accuracyScore: 50,
      errorType: "Mispronunciation",
      syllables: [],
      phonemes: [
        { symbol: "s", accuracyScore: 80, position: "initial", alternatives: [] },
        { symbol: "t", accuracyScore: 20, position: "final", alternatives: [] },
      ],
    });
    const sounds = soundsToFix(r);
    expect(sounds.length).toBeGreaterThanOrEqual(1);
    expect(sounds[0].symbol.toLowerCase()).toBe("t");
    expect(sounds[0].occurrences).toBe(2);
    expect(sounds.filter((s) => s.symbol.toLowerCase() === "t")).toHaveLength(1);
    expect(sounds[0].prompt).toMatch(/ending/);
  });

  it("excludes phonemes from wholly omitted words", () => {
    const r = makeResult({
      words: [
        {
          text: "walked",
          accuracyScore: 0,
          errorType: "Omission",
          syllables: [],
          phonemes: [{ symbol: "t", accuracyScore: 5, position: "final", alternatives: [] }],
        },
      ],
    });
    expect(soundsToFix(r)).toEqual([]);
    expect(endingSoundAlerts(r)).toEqual([]);
  });

  it("raises ending-sound alerts for final phonemes below 60", () => {
    const r = parsePronunciationJson(FULL_FIXTURE, "She walked slowly.");
    const alerts = endingSoundAlerts(r);
    expect(alerts.map((a) => a.word)).toContain("walked");
    expect(alerts[0].message).toMatch(/needs attention/);
  });

  it("surfaces the target sound and most likely heard sound for a weak final consonant", () => {
    const r = parsePronunciationJson(WEAK_FINAL_FIXTURE, "She played.");
    const played = r.words.find((w) => w.text === "played");
    expect(played).toBeDefined();
    const last = played!.phonemes[played!.phonemes.length - 1];
    expect(last.symbol).toBe("d");
    expect(last.position).toBe("final");
    expect(last.alternatives.map((a) => a.symbol)).toEqual(["t", "d"]);

    const sounds = soundsToFix(r);
    expect(sounds[0].symbol).toBe("d");
    expect(sounds[0].word).toBe("played");
    expect(sounds[0].alternative?.symbol).toBe("t");
    expect(sounds[0].prompt).toContain("/d/");
    expect(sounds[0].prompt).toContain("played");

    const alerts = endingSoundAlerts(r);
    expect(alerts.map((a) => a.word)).toContain("played");
    expect(alerts[0].message).toMatch(/needs attention|likely weak or missing/);
  });

  it("never asserts a definite omission from a low score alone", () => {
    const careful = describeFinalPhoneme("played", "d", false);
    expect(careful).toMatch(/needs attention|likely weak or missing/);
    expect(careful).not.toMatch(/definitely omitted|you definitely/);
    const explicit = describeFinalPhoneme("played", "d", true);
    expect(explicit).toMatch(/omitted/);
  });
});
