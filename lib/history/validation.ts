import type {
  AssessmentResult,
  AssessedPhoneme,
  AssessedSyllable,
  AssessedWord,
} from "@/lib/types";
import { MAX_CHARS, MAX_WORDS, normalizeText } from "@/lib/text";
import {
  EVALUATION_SCHEMA_VERSION,
  HISTORY_SCHEMA_VERSION,
  isUuid,
  normalizeReferenceText,
  type AttemptCreatePayload,
  type EvaluationPayload,
  type SourceIdentity,
} from "@/lib/history/types";

const MAX_TEXT_LENGTH = MAX_CHARS;
const MAX_WORDS_LIMIT = 2000;
const MAX_SYLLABLES = 8000;
const MAX_PHONEMES = 20000;

function isFiniteScore(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
}

function optionalScore(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (!isFiniteScore(v)) throw new Error("score-out-of-range");
  return v;
}

function checkWord(w: unknown): void {
  if (typeof w !== "object" || w === null) throw new Error("invalid-word");
  const word = w as Record<string, unknown>;
  if (typeof word.text !== "string" || word.text.length > 80) throw new Error("invalid-word-text");
  optionalScore(word.accuracyScore);
  if (word.errorType !== undefined && typeof word.errorType !== "string")
    throw new Error("invalid-error-type");
  if (!Array.isArray(word.syllables) || !Array.isArray(word.phonemes))
    throw new Error("invalid-word-children");
  if (word.syllables.length > 60 || word.phonemes.length > 120)
    throw new Error("word-children-too-large");
  for (const s of word.syllables as unknown[]) {
    const syl = s as Record<string, unknown>;
    if (typeof syl.text !== "string" || syl.text.length > 80) throw new Error("invalid-syllable");
    optionalScore(syl.accuracyScore);
  }
  for (const p of word.phonemes as unknown[]) {
    const ph = p as Record<string, unknown>;
    if (typeof ph.symbol !== "string" || ph.symbol.length > 16)
      throw new Error("invalid-phoneme");
    optionalScore(ph.accuracyScore);
    if (!Array.isArray(ph.alternatives)) throw new Error("invalid-alternatives");
    if ((ph.alternatives as unknown[]).length > 5) throw new Error("alternatives-too-large");
  }
}

export function validateAssessmentResult(raw: unknown): AssessmentResult {
  if (typeof raw !== "object" || raw === null) throw new Error("invalid-result");
  const r = raw as Record<string, unknown>;
  if (typeof r.referenceText !== "string" || r.referenceText.length > MAX_TEXT_LENGTH + 100)
    throw new Error("invalid-reference-text");
  if (typeof r.recognizedText !== "string" || r.recognizedText.length > MAX_TEXT_LENGTH + 200)
    throw new Error("invalid-recognized-text");
  const pronunciationScore = optionalScore(r.pronunciationScore);
  const accuracyScore = optionalScore(r.accuracyScore);
  const fluencyScore = optionalScore(r.fluencyScore);
  const completenessScore = optionalScore(r.completenessScore);
  const prosodyScore = optionalScore(r.prosodyScore);
  if (!Array.isArray(r.words) || !Array.isArray(r.insertedWords))
    throw new Error("invalid-words");
  if ((r.words as unknown[]).length > MAX_WORDS_LIMIT) throw new Error("too-many-words");
  if ((r.insertedWords as unknown[]).length > 500) throw new Error("too-many-inserted");
  let syllables = 0;
  let phonemes = 0;
  for (const w of [...(r.words as unknown[]), ...(r.insertedWords as unknown[])]) {
    checkWord(w);
    const ww = w as { syllables: unknown[]; phonemes: unknown[] };
    syllables += ww.syllables.length;
    phonemes += ww.phonemes.length;
  }
  if (syllables > MAX_SYLLABLES || phonemes > MAX_PHONEMES) throw new Error("result-too-large");
  return {
    referenceText: r.referenceText as string,
    recognizedText: r.recognizedText as string,
    pronunciationScore,
    accuracyScore,
    fluencyScore,
    completenessScore,
    prosodyScore,
    words: r.words as AssessedWord[],
    insertedWords: r.insertedWords as AssessedWord[],
  };
}

export function validateSourceIdentity(raw: unknown): SourceIdentity {
  if (typeof raw !== "object" || raw === null) throw new Error("invalid-source");
  const s = raw as Record<string, unknown>;
  if (s.kind === "library") {
    if (typeof s.id !== "string" || s.id.length === 0 || s.id.length > 120)
      throw new Error("invalid-source-id");
    if (!Number.isInteger(s.version) || (s.version as number) < 0)
      throw new Error("invalid-source-version");
    return { kind: "library", id: s.id as string, version: s.version as number };
  }
  if (s.kind === "custom") {
    if (typeof s.hash !== "string" || s.hash.length === 0 || s.hash.length > 32)
      throw new Error("invalid-source-hash");
    return { kind: "custom", hash: s.hash as string };
  }
  throw new Error("invalid-source-kind");
}

export function validateAttemptCreate(raw: unknown): AttemptCreatePayload {
  if (typeof raw !== "object" || raw === null) throw new Error("invalid-payload");
  const p = raw as Record<string, unknown>;
  if (p.schemaVersion !== HISTORY_SCHEMA_VERSION) throw new Error("unsupported-schema");
  if (typeof p.recordedAt !== "string" || Number.isNaN(Date.parse(p.recordedAt)))
    throw new Error("invalid-recorded-at");
  if (!Number.isInteger(p.durationMs) || (p.durationMs as number) < 0 || (p.durationMs as number) > 45000)
    throw new Error("invalid-duration");
  if (p.stopReason !== "manual" && p.stopReason !== "limit") throw new Error("invalid-stop-reason");
  if (typeof p.referenceText !== "string") throw new Error("invalid-reference-text");
  const normalized = normalizeText(p.referenceText as string);
  if (normalized.length === 0 || normalized.length > MAX_TEXT_LENGTH)
    throw new Error("invalid-reference-text");
  if (p.title !== null && (typeof p.title !== "string" || (p.title as string).length > 200))
    throw new Error("invalid-title");
  if (p.level !== null && (typeof p.level !== "string" || (p.level as string).length > 16))
    throw new Error("invalid-level");
  if (p.scope !== "passage") throw new Error("invalid-scope");
  if (p.locale !== "en-US") throw new Error("invalid-locale");
  return {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    recordedAt: p.recordedAt as string,
    durationMs: p.durationMs as number,
    stopReason: p.stopReason as "manual" | "limit",
    referenceText: normalized,
    title: (p.title as string | null) ?? null,
    level: (p.level as string | null) ?? null,
    source: validateSourceIdentity(p.source),
    scope: "passage",
    locale: "en-US",
  };
}

export function validateEvaluationPayload(raw: unknown): EvaluationPayload {
  if (typeof raw !== "object" || raw === null) throw new Error("invalid-payload");
  const p = raw as Record<string, unknown>;
  if (typeof p.evaluationId !== "string" || !isUuid(p.evaluationId as string))
    throw new Error("invalid-evaluation-id");
  if (!Number.isInteger(p.expectedRevision) || (p.expectedRevision as number) < 0)
    throw new Error("invalid-revision");
  if (typeof p.evaluatedAt !== "string" || Number.isNaN(Date.parse(p.evaluatedAt as string)))
    throw new Error("invalid-evaluated-at");
  const cfg = p.assessmentConfig as Record<string, unknown> | undefined;
  if (!cfg || cfg.provider !== "azure") throw new Error("invalid-config");
  if (cfg.locale !== "en-US") throw new Error("invalid-config-locale");
  const hasResult = p.result !== undefined && p.result !== null;
  const hasFailure = p.failure !== undefined && p.failure !== null;
  if (hasResult === hasFailure) throw new Error("result-or-failure-required");
  let result: AssessmentResult | undefined;
  if (hasResult) result = validateAssessmentResult(p.result);
  let failure: { kind: string; message: string } | undefined;
  if (hasFailure) {
    const f = p.failure as Record<string, unknown>;
    if (typeof f.kind !== "string" || typeof f.message !== "string")
      throw new Error("invalid-failure");
    if (f.message.length > 500) throw new Error("failure-too-long");
    failure = { kind: f.kind as string, message: (f.message as string).slice(0, 500) };
  }
  return {
    evaluationId: p.evaluationId as string,
    expectedRevision: p.expectedRevision as number,
    evaluatedAt: p.evaluatedAt as string,
    assessmentConfig: {
      provider: "azure",
      sdkVersion: String(cfg.sdkVersion ?? "unknown").slice(0, 40),
      locale: "en-US",
      enableProsody: Boolean(cfg.enableProsody),
      phonemeAlphabet: "IPA",
      granularity: "phoneme",
      gradingSystem: "hundred-mark",
      miscue: Boolean(cfg.miscue ?? true),
      parserVersion: EVALUATION_SCHEMA_VERSION,
    },
    result,
    failure,
  };
}

export function scoresFromResult(result: AssessmentResult | null): {
  pronunciationScore: number | null;
  accuracyScore: number | null;
  fluencyScore: number | null;
  completenessScore: number | null;
  prosodyScore: number | null;
} {
  const pick = (v: number | undefined) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;
  if (!result)
    return {
      pronunciationScore: null,
      accuracyScore: null,
      fluencyScore: null,
      completenessScore: null,
      prosodyScore: null,
    };
  return {
    pronunciationScore: pick(result.pronunciationScore),
    accuracyScore: pick(result.accuracyScore),
    fluencyScore: pick(result.fluencyScore),
    completenessScore: pick(result.completenessScore),
    prosodyScore: pick(result.prosodyScore),
  };
}

export { normalizeReferenceText, MAX_WORDS };
export type { AssessedPhoneme, AssessedSyllable, AssessedWord };
