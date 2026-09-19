import {
  FOCUS_THRESHOLD,
  primaryDrill,
  soundsToFix,
} from "@/lib/assessment-guidance";
import type { AssessmentResult } from "@/lib/types";

/**
 * Milestone 5 (Track B) pilot: one extra coaching note built ONLY from
 * structured Azure assessment data plus reviewed static tips.
 *
 * - No LLM, no network, no new runtime subscription.
 * - Disabled by default; enable with NEXT_PUBLIC_ENABLE_EXTRA_COACHING=1.
 * - Fail open: any error or missing evidence returns null; callers render
 *   nothing and the normal results still show.
 */

export const EXTRA_COACHING_FLAG = "NEXT_PUBLIC_ENABLE_EXTRA_COACHING";

export function isExtraCoachingPilotEnabled(): boolean {
  try {
    // Keep this property access static. Next.js only inlines NEXT_PUBLIC_*
    // values into browser bundles when it can see the variable name at build
    // time; a computed lookup works in Vitest but stays undefined in a browser.
    return process.env.NEXT_PUBLIC_ENABLE_EXTRA_COACHING === "1";
  } catch {
    return false;
  }
}

export type ReviewedCoachingTip = {
  id: string;
  title: string;
  /** Concrete practice fragment appended after the drill exercise. */
  exercise: string;
};

export const REVIEWED_COACHING_TIPS: readonly ReviewedCoachingTip[] = [
  {
    id: "finish-endings",
    title: "Finish word endings",
    exercise:
      "Say the final sound carefully, then the word twice, then the phrase. Finish the word clearly without adding an extra vowel.",
  },
  {
    id: "start-sounds",
    title: "Start words cleanly",
    exercise:
      "Say the first sound carefully, then the word twice, then the phrase. Begin the word cleanly without adding a sound before it.",
  },
  {
    id: "steady-middle",
    title: "Keep middle sounds clear",
    exercise:
      "Say the word slowly twice while keeping the target sound clear, then say the phrase at normal speed.",
  },
] as const;

function tipForPosition(position: string): ReviewedCoachingTip {
  if (position === "final") return REVIEWED_COACHING_TIPS[0];
  if (position === "initial") return REVIEWED_COACHING_TIPS[1];
  return REVIEWED_COACHING_TIPS[2];
}

export type ExtraCoachingNote = {
  sound: string;
  word: string;
  positionLabel: string;
  score: number;
  observation: string;
  exercise: string;
  tipId: string;
  tipTitle: string;
  source: "pilot-deterministic";
};

/**
 * Build at most one extra note. Returns null when there is no evidenced
 * low score (primaryDrill() is null) or anything unexpected happens.
 * Never invents a sound: the symbol/word/score come straight from
 * primaryDrill(), which itself derives from soundsToFix().
 */
export function buildExtraCoachingNote(result: AssessmentResult): ExtraCoachingNote | null {
  try {
    const drill = primaryDrill(result);
    if (!drill) return null;
    if (
      typeof drill.score !== "number" ||
      !Number.isFinite(drill.score) ||
      drill.score >= FOCUS_THRESHOLD
    ) {
      return null;
    }
    const tip = tipForPosition(
      drill.positionLabel === "end"
        ? "final"
        : drill.positionLabel === "beginning"
          ? "initial"
          : "middle",
    );
    return {
      sound: drill.symbol,
      word: drill.word,
      positionLabel: drill.positionLabel,
      score: drill.score,
      observation: `Azure scored /${drill.symbol}/ in \u201c${drill.word}\u201d at ${Math.round(drill.score)} \u2014 the lowest evidenced sound in this take.`,
      exercise: `${drill.exercise} Reviewed tip (${tip.title}): ${tip.exercise}`,
      tipId: tip.id,
      tipTitle: tip.title,
      source: "pilot-deterministic",
    };
  } catch {
    return null;
  }
}

/**
 * Grounding check used by tests and available to future callers:
 * the note must reference a real low sound from soundsToFix() with a
 * matching score, and must not contradict primaryDrill().
 */
export function validateExtraCoachingNote(
  note: ExtraCoachingNote,
  result: AssessmentResult,
): string[] {
  const errors: string[] = [];
  const sounds = soundsToFix(result);
  const match = sounds.find(
    (s) => s.symbol.toLowerCase() === note.sound.toLowerCase() && s.word === note.word,
  );
  if (!match) {
    errors.push(`note references unsupported sound /${note.sound}/ in \u201c${note.word}\u201d`);
    return errors;
  }
  if (match.score !== note.score) errors.push("note score does not match evidenced score");
  if (match.score >= FOCUS_THRESHOLD) errors.push("note is not grounded in a low score");
  const drill = primaryDrill(result);
  if (drill) {
    if (drill.symbol.toLowerCase() !== note.sound.toLowerCase() || drill.word !== note.word) {
      errors.push("note contradicts primaryDrill()");
    }
    if (!note.exercise.includes(drill.phrase)) errors.push("note exercise drops the drill phrase");
  }
  if (!note.exercise || note.exercise.trim().length < 10) errors.push("note needs a concrete exercise");
  if (!REVIEWED_COACHING_TIPS.some((t) => t.id === note.tipId)) {
    errors.push("note uses an unreviewed tip");
  }
  return errors;
}
