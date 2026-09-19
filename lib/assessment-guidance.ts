import { isWordOmitted } from "@/lib/azure/result-parser";
import type {
  AssessedPhoneme,
  AssessmentResult,
  ScoreBand,
} from "@/lib/types";

export const FOCUS_THRESHOLD = 60;
export const REVIEW_THRESHOLD = 80;

export function clampScore(score: number | undefined): number | undefined {
  if (typeof score !== "number" || !Number.isFinite(score)) return undefined;
  return Math.max(0, Math.min(100, score));
}

export function formatScore(score: number | undefined): string {
  const clamped = clampScore(score);
  if (clamped === undefined) return "—";
  return Number.isInteger(clamped) ? String(clamped) : clamped.toFixed(1);
}

export function overallLabel(score: number | undefined): string {
  const clamped = clampScore(score);
  if (clamped === undefined) return "No score";
  if (clamped >= 90) return "Excellent";
  if (clamped >= 80) return "Good";
  if (clamped >= 60) return "Getting there";
  return "Needs practice";
}

export function scoreBandForWord(score: number | undefined, errorType?: string): ScoreBand {
  if (errorType === "Omission") return "omitted";
  const clamped = clampScore(score);
  if (clamped === undefined) return "review";
  if (clamped >= REVIEW_THRESHOLD) return "strong";
  if (clamped >= FOCUS_THRESHOLD) return "review";
  return "focus";
}

export function scoreBandForPhoneme(score: number | undefined): ScoreBand {
  const clamped = clampScore(score);
  if (clamped === undefined) return "review";
  if (clamped >= REVIEW_THRESHOLD) return "strong";
  if (clamped >= FOCUS_THRESHOLD) return "review";
  return "focus";
}

export type MetricKey = "accuracy" | "fluency" | "completeness" | "prosody";

export const METRIC_EXPLANATIONS: Record<MetricKey, string> = {
  accuracy: "How close your sounds were to native-like pronunciation.",
  fluency: "How smoothly and naturally your speech flowed.",
  completeness: "How much of the passage you actually said.",
  prosody: "How natural your rhythm, stress, and intonation sounded.",
};

export function weakestMetric(result: AssessmentResult): {
  key: MetricKey;
  score?: number;
  suggestion: string;
} {
  const candidates: Array<{ key: MetricKey; score?: number }> = [
    { key: "accuracy", score: clampScore(result.accuracyScore) },
    { key: "fluency", score: clampScore(result.fluencyScore) },
    { key: "completeness", score: clampScore(result.completenessScore) },
  ];
  const prosody = clampScore(result.prosodyScore);
  if (prosody !== undefined) candidates.push({ key: "prosody", score: prosody });
  const finite = candidates.filter((c) => c.score !== undefined) as Array<{
    key: MetricKey;
    score: number;
  }>;
  if (finite.length === 0) {
    return {
      key: "accuracy",
      score: undefined,
      suggestion:
        "Azure did not return enough scores to suggest a focus. Try recording again in a quieter spot.",
    };
  }
  finite.sort((a, b) => a.score - b.score);
  const weakest = finite[0];
  const suggestions: Record<MetricKey, string> = {
    accuracy:
      "Focus: Accuracy was your lowest score. Slow down and shape each sound carefully on your next try.",
    fluency:
      "Focus: Fluency was your lowest score. Read in smooth phrases and avoid long pauses on your next try.",
    completeness:
      "Focus: Completeness was your lowest score. Make sure you say every word in the passage on your next try.",
    prosody:
      "Focus: Prosody was your lowest score. Stress the important words and let your voice rise and fall naturally.",
  };
  return { key: weakest.key, score: weakest.score, suggestion: suggestions[weakest.key] };
}

export type SoundToFix = {
  symbol: string;
  word: string;
  position: AssessedPhoneme["position"];
  positionLabel: "beginning" | "middle" | "end" | "whole word";
  score: number;
  alternative?: { symbol: string; confidence?: number };
  prompt: string;
  occurrences: number;
};

function positionLabel(p: AssessedPhoneme["position"]): SoundToFix["positionLabel"] {
  if (p === "initial") return "beginning";
  if (p === "medial") return "middle";
  if (p === "final") return "end";
  return "whole word";
}

function focusPrompt(
  symbol: string,
  word: string,
  position: AssessedPhoneme["position"],
): string {
  if (position === "only") return `Practice the sound /${symbol}/ in \u2018${word}\u2019.`;
  if (position === "initial") return `Practice the beginning /${symbol}/ in \u2018${word}\u2019.`;
  if (position === "final") return `Practice the ending /${symbol}/ in \u2018${word}\u2019.`;
  return `Practice the middle /${symbol}/ in \u2018${word}\u2019.`;
}

/**
 * Rank the 3–5 lowest-scoring expected phonemes.
 * Excludes phonemes from words Azure explicitly marks wholly omitted.
 * Groups repeated weak instances by symbol so the same sound is not repeated excessively.
 */
export function soundsToFix(result: AssessmentResult, limit = 5): SoundToFix[] {
  const target = Math.max(3, Math.min(5, limit));
  type Entry = { symbol: string; word: string; position: AssessedPhoneme["position"]; score: number; alternative?: { symbol: string; confidence?: number } };
  const entries: Entry[] = [];
  for (const word of result.words) {
    if (isWordOmitted(word)) continue;
    for (const phoneme of word.phonemes) {
      const score = clampScore(phoneme.accuracyScore);
      if (score === undefined || score >= FOCUS_THRESHOLD) continue;
      const alt = phoneme.alternatives.find((a) => a.symbol !== phoneme.symbol) ?? phoneme.alternatives[0];
      entries.push({
        symbol: phoneme.symbol,
        word: word.text,
        position: phoneme.position,
        score,
        alternative: alt ? { symbol: alt.symbol, confidence: alt.confidence } : undefined,
      });
    }
  }
  entries.sort((a, b) => a.score - b.score);

  const grouped = new Map<string, { items: Entry[]; worst: number }>();
  for (const e of entries) {
    const key = e.symbol.toLowerCase();
    const g = grouped.get(key);
    if (g) {
      g.items.push(e);
      g.worst = Math.min(g.worst, e.score);
    } else {
      grouped.set(key, { items: [e], worst: e.score });
    }
  }
  const sorted = [...grouped.values()].sort((a, b) => a.worst - b.worst).slice(0, target);
  return sorted.map((g) => {
    // Representative: worst-scoring instance of that sound.
    const rep = [...g.items].sort((a, b) => a.score - b.score)[0];
    return {
      symbol: rep.symbol,
      word: rep.word,
      position: rep.position,
      positionLabel: positionLabel(rep.position),
      score: rep.score,
      alternative: rep.alternative,
      prompt: focusPrompt(rep.symbol, rep.word, rep.position),
      occurrences: g.items.length,
    };
  });
}

export type EndingAlert = {
  word: string;
  symbol: string;
  score: number;
  /** Careful wording: Azure does not necessarily label a weak final phoneme as omitted. */
  message: string;
  explicitlyOmitted: boolean;
};

export function endingSoundAlerts(result: AssessmentResult): EndingAlert[] {
  const alerts: EndingAlert[] = [];
  for (const word of result.words) {
    if (word.phonemes.length === 0) continue;
    const last = word.phonemes[word.phonemes.length - 1];
    const score = clampScore(last.accuracyScore);
    if (score === undefined || score >= FOCUS_THRESHOLD) continue;
    if (isWordOmitted(word)) continue; // excluded: no reliable spoken comparison
    const explicitlyOmitted = isWordOmitted(word);
    alerts.push({
      word: word.text,
      symbol: last.symbol,
      score,
      message: `Ending /${last.symbol}/ needs attention in \u2018${word.text}\u2019 — likely weak or missing.`,
      explicitlyOmitted,
    });
  }
  return alerts;
}

/**
 * Careful single-phoneme wording for tests/UI: never assert a definite
 * omission from a low score alone.
 */
export function describeFinalPhoneme(word: string, symbol: string, explicitlyOmitted: boolean): string {
  if (explicitlyOmitted) return `You omitted the final /${symbol}/ in \u2018${word}\u2019.`;
  return `Final /${symbol}/ in \u2018${word}\u2019 needs attention — likely weak or missing.`;
}
