import type { AssessmentResult } from "@/lib/types";

export const HISTORY_SCHEMA_VERSION = 1;
export const EVALUATION_SCHEMA_VERSION = 1;

export type SourceIdentity =
  | { kind: "library"; id: string; version: number }
  | { kind: "custom"; hash: string };

export type AttemptScope = "passage";
export type StopReason = "manual" | "limit";
export type EvaluationState = "pending" | "success" | "failed";

export type AssessmentConfigSnapshot = {
  provider: "azure";
  sdkVersion: string;
  locale: string;
  enableProsody: boolean;
  phonemeAlphabet: "IPA";
  granularity: "phoneme";
  gradingSystem: "hundred-mark";
  miscue: boolean;
  parserVersion: number;
};

export type AttemptSummary = {
  id: string;
  schemaVersion: number;
  recordedAt: string;
  durationMs: number;
  stopReason: StopReason;
  referenceText: string;
  title: string | null;
  level: string | null;
  source: SourceIdentity;
  scope: AttemptScope;
  locale: string;
  evaluationState: EvaluationState;
  revision: number;
  pronunciationScore: number | null;
  accuracyScore: number | null;
  fluencyScore: number | null;
  completenessScore: number | null;
  prosodyScore: number | null;
  hasAudio: boolean;
};

export type AttemptDetail = AttemptSummary & {
  createdAt: string;
  evaluationId: string | null;
  evaluatedAt: string | null;
  assessmentConfig: AssessmentConfigSnapshot | null;
  evaluation: AssessmentResult | null;
  failureKind: string | null;
  failureMessage: string | null;
  previousAttemptId: string | null;
  previousSummary: AttemptSummary | null;
};

export type EvaluationPayload = {
  evaluationId: string;
  expectedRevision: number;
  evaluatedAt: string;
  assessmentConfig: AssessmentConfigSnapshot;
  result?: AssessmentResult;
  failure?: { kind: string; message: string };
};

export type AttemptCreatePayload = {
  schemaVersion: number;
  recordedAt: string;
  durationMs: number;
  stopReason: StopReason;
  referenceText: string;
  title: string | null;
  level: string | null;
  source: SourceIdentity;
  scope: AttemptScope;
  locale: string;
};

export function normalizeReferenceText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
