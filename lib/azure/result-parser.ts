import type {
  AssessedPhoneme,
  AssessedSyllable,
  AssessedWord,
  AssessmentResult,
  PhonemePosition,
} from "@/lib/types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function finiteNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function textValue(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function phonemePosition(index: number, total: number): PhonemePosition {
  if (total <= 1) return "only";
  if (index === 0) return "initial";
  if (index === total - 1) return "final";
  return "medial";
}

function parsePhoneme(raw: unknown, index: number, total: number): AssessedPhoneme | null {
  if (!isRecord(raw)) return null;
  const symbol = textValue(raw["Phoneme"]);
  if (!symbol) return null;
  const pa = isRecord(raw["PronunciationAssessment"])
    ? (raw["PronunciationAssessment"] as Record<string, unknown>)
    : {};
  const accuracyScore = finiteNumber(pa["AccuracyScore"]);
  const alternatives: AssessedPhoneme["alternatives"] = [];
  // Azure nests N-best candidates under the phoneme's PronunciationAssessment
  // object (this matches the Speech SDK's own detail-result types).
  const nbest = pa["NBestPhonemes"];
  if (Array.isArray(nbest)) {
    for (const item of nbest.slice(0, 5)) {
      if (!isRecord(item)) continue;
      const sym = textValue(item["Phoneme"]);
      if (!sym) continue;
      alternatives.push({ symbol: sym, confidence: finiteNumber(item["Score"]) });
    }
  }
  return {
    symbol,
    accuracyScore,
    position: phonemePosition(index, total),
    alternatives,
  };
}

function parseSyllable(raw: unknown): AssessedSyllable | null {
  if (!isRecord(raw)) return null;
  const text = textValue(raw["Syllable"]) ?? "";
  const pa = isRecord(raw["PronunciationAssessment"])
    ? (raw["PronunciationAssessment"] as Record<string, unknown>)
    : {};
  return {
    text,
    accuracyScore: finiteNumber(pa["AccuracyScore"]),
    errorType: textValue(pa["ErrorType"]),
    offset: finiteNumber(raw["Offset"]),
    duration: finiteNumber(raw["Duration"]),
  };
}

function parseWord(raw: unknown): AssessedWord | null {
  if (!isRecord(raw)) return null;
  const text = textValue(raw["Word"]);
  if (!text) return null;
  const pa = isRecord(raw["PronunciationAssessment"])
    ? (raw["PronunciationAssessment"] as Record<string, unknown>)
    : {};
  const syllables: AssessedSyllable[] = [];
  if (Array.isArray(raw["Syllables"])) {
    for (const s of raw["Syllables"] as unknown[]) {
      const parsed = parseSyllable(s);
      if (parsed) syllables.push(parsed);
    }
  }
  const phonemes: AssessedPhoneme[] = [];
  const rawPhonemes = Array.isArray(raw["Phonemes"]) ? (raw["Phonemes"] as unknown[]) : [];
  rawPhonemes.forEach((p, i) => {
    const parsed = parsePhoneme(p, i, rawPhonemes.length);
    if (parsed) phonemes.push(parsed);
  });
  return {
    text,
    accuracyScore: finiteNumber(pa["AccuracyScore"]),
    errorType: textValue(pa["ErrorType"]),
    offset: finiteNumber(raw["Offset"]),
    duration: finiteNumber(raw["Duration"]),
    syllables,
    phonemes,
  };
}

function isOmissionError(errorType?: string): boolean {
  return errorType === "Omission";
}

function isInsertionError(errorType?: string): boolean {
  return errorType === "Insertion";
}

/**
 * Parse the detailed SDK JSON (SpeechServiceResponse_JsonResult).
 * Defensive: Azure fields can be missing. Prefer NBest[0].
 */
export function parsePronunciationJson(rawText: string, referenceText: string): AssessmentResult {
  const empty: AssessmentResult = {
    referenceText,
    recognizedText: "",
    words: [],
    insertedWords: [],
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    return empty;
  }
  if (!isRecord(parsed)) return empty;
  const nbest = parsed["NBest"];
  if (!Array.isArray(nbest) || nbest.length === 0) return empty;
  const best = nbest[0];
  if (!isRecord(best)) return empty;

  const recognizedText = textValue(best["Display"]) ?? textValue(best["Lexical"]) ?? "";
  const pa = isRecord(best["PronunciationAssessment"])
    ? (best["PronunciationAssessment"] as Record<string, unknown>)
    : {};

  const words: AssessedWord[] = [];
  const insertedWords: AssessedWord[] = [];
  if (Array.isArray(best["Words"])) {
    for (const w of best["Words"] as unknown[]) {
      const word = parseWord(w);
      if (!word) continue;
      if (isInsertionError(word.errorType)) insertedWords.push(word);
      else words.push(word);
    }
  }

  return {
    referenceText,
    recognizedText,
    pronunciationScore: finiteNumber(pa["PronScore"]),
    accuracyScore: finiteNumber(pa["AccuracyScore"]),
    fluencyScore: finiteNumber(pa["FluencyScore"]),
    completenessScore: finiteNumber(pa["CompletenessScore"]),
    prosodyScore: finiteNumber(pa["ProsodyScore"]),
    words,
    insertedWords,
  };
}

export function isWordOmitted(word: AssessedWord): boolean {
  return isOmissionError(word.errorType);
}

export { isOmissionError };
