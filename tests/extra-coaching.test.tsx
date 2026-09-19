import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  buildExtraCoachingNote,
  EXTRA_COACHING_FLAG,
  isExtraCoachingPilotEnabled,
  REVIEWED_COACHING_TIPS,
  validateExtraCoachingNote,
  type ExtraCoachingNote,
} from "@/lib/extra-coaching";
import { primaryDrill, soundsToFix } from "@/lib/assessment-guidance";
import { parsePronunciationJson } from "@/lib/azure/result-parser";
import type { AssessmentResult } from "@/lib/types";
import { FULL_FIXTURE, WEAK_FINAL_FIXTURE } from "@/tests/result-parser.test";
import ExtraCoachingNoteView from "@/components/extra-coaching-note";

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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("extra coaching pilot gating", () => {
  it("is disabled by default and only enables on exactly '1'", () => {
    vi.stubEnv(EXTRA_COACHING_FLAG, undefined);
    expect(isExtraCoachingPilotEnabled()).toBe(false);
    vi.stubEnv(EXTRA_COACHING_FLAG, "0");
    expect(isExtraCoachingPilotEnabled()).toBe(false);
    vi.stubEnv(EXTRA_COACHING_FLAG, "yes");
    expect(isExtraCoachingPilotEnabled()).toBe(false);
    vi.stubEnv(EXTRA_COACHING_FLAG, "1");
    expect(isExtraCoachingPilotEnabled()).toBe(true);
  });

  it("renders nothing when the pilot is disabled (fail open)", () => {
    vi.stubEnv(EXTRA_COACHING_FLAG, undefined);
    const r = parsePronunciationJson(WEAK_FINAL_FIXTURE, "She played.");
    const { container } = render(<ExtraCoachingNoteView result={r} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByLabelText("Pilot coaching note")).toBeNull();
  });

  it("renders exactly one grounded note when enabled", () => {
    vi.stubEnv(EXTRA_COACHING_FLAG, "1");
    const r = parsePronunciationJson(WEAK_FINAL_FIXTURE, "She played.");
    render(<ExtraCoachingNoteView result={r} />);
    expect(screen.getAllByLabelText("Pilot coaching note")).toHaveLength(1);
    expect(screen.getByText(/lowest evidenced sound/)).toBeInTheDocument();
  });

  it("renders nothing when note generation fails", () => {
    vi.stubEnv(EXTRA_COACHING_FLAG, "1");
    const malformed = { words: null } as unknown as AssessmentResult;
    const { container } = render(<ExtraCoachingNoteView result={malformed} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByLabelText("Pilot coaching note")).toBeNull();
  });
});

describe("extra coaching grounding", () => {
  it("builds one note from fixture scores without inventing errors", () => {
    const r = parsePronunciationJson(WEAK_FINAL_FIXTURE, "She played.");
    const note = buildExtraCoachingNote(r);
    expect(note).not.toBeNull();
    expect(note!.sound).toBe("d");
    expect(note!.word).toBe("played");
    expect(note!.score).toBe(28);
    expect(note!.observation).toContain("/d/");
    expect(note!.observation).toContain("played");
    expect(note!.exercise).toContain(note!.word);
    expect(validateExtraCoachingNote(note!, r)).toEqual([]);
  });

  it("uses only reviewed tips and never contradicts primaryDrill()/soundsToFix()", () => {
    const r = parsePronunciationJson(FULL_FIXTURE, "She walked slowly.");
    const note = buildExtraCoachingNote(r);
    expect(note).not.toBeNull();
    const drill = primaryDrill(r)!;
    expect(note!.sound.toLowerCase()).toBe(drill.symbol.toLowerCase());
    expect(note!.word).toBe(drill.word);
    expect(REVIEWED_COACHING_TIPS.map((t) => t.id)).toContain(note!.tipId);
    const symbols = soundsToFix(r).map((s) => `${s.symbol.toLowerCase()}@${s.word}`);
    expect(symbols).toContain(`${note!.sound.toLowerCase()}@${note!.word}`);
    expect(validateExtraCoachingNote(note!, r)).toEqual([]);
  });

  it("returns null (no note) when every sound clears the threshold", () => {
    expect(buildExtraCoachingNote(makeResult())).toBeNull();
  });

  it("rejects unsupported sound diagnoses", () => {
    const r = parsePronunciationJson(WEAK_FINAL_FIXTURE, "She played.");
    const fake: ExtraCoachingNote = {
      sound: "θ",
      word: "played",
      positionLabel: "middle",
      score: 10,
      observation: "invented",
      exercise: "do something with played",
      tipId: REVIEWED_COACHING_TIPS[0].id,
      tipTitle: REVIEWED_COACHING_TIPS[0].title,
      source: "pilot-deterministic",
    };
    const errors = validateExtraCoachingNote(fake, r);
    expect(errors.join(" ")).toMatch(/unsupported sound/);
  });

  it("fails open on malformed input instead of throwing", () => {
    const bad = { referenceText: "", recognizedText: "", words: [], insertedWords: [] } as AssessmentResult;
    expect(() => buildExtraCoachingNote(bad)).not.toThrow();
    expect(buildExtraCoachingNote(bad)).toBeNull();
  });
});
