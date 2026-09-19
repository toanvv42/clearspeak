import { normalizeReferenceText, type AttemptSummary } from "@/lib/history/types";
import { EVALUATION_SCHEMA_VERSION } from "@/lib/history/types";

export type CompatibleCandidate = Pick<
  AttemptSummary,
  | "id"
  | "referenceText"
  | "source"
  | "scope"
  | "locale"
  | "evaluationState"
  | "stopReason"
  | "recordedAt"
> & {
  assessmentConfigKey?: string | null;
  evaluationSchemaVersion?: number | null;
};

export function configKeyFor(
  cfg: { provider: string; locale: string; enableProsody: boolean } | null | undefined,
): string | null {
  if (!cfg) return null;
  return `${cfg.provider}|${cfg.locale}|prosody:${cfg.enableProsody ? "1" : "0"}`;
}

export function isCompatiblePair(
  current: CompatibleCandidate & { referenceText: string },
  candidate: CompatibleCandidate & { referenceText: string },
  currentConfigKey: string | null,
  candidateConfigKey: string | null,
  currentSchemaVersion: number = EVALUATION_SCHEMA_VERSION,
  candidateSchemaVersion: number | null | undefined = EVALUATION_SCHEMA_VERSION,
): boolean {
  if (candidate.evaluationState !== "success") return false;
  if (candidate.stopReason === "limit") return false;
  if (candidate.scope !== current.scope) return false;
  if (candidate.locale !== current.locale) return false;
  if (normalizeReferenceText(candidate.referenceText) !== normalizeReferenceText(current.referenceText))
    return false;
  if (current.source.kind !== candidate.source.kind) return false;
  if (current.source.kind === "library" && candidate.source.kind === "library") {
    if (current.source.id !== candidate.source.id) return false;
    if (current.source.version !== candidate.source.version) return false;
  }
  // Custom texts: hash alone is insufficient; exact normalized text equality above is required.
  if (currentConfigKey && candidateConfigKey && currentConfigKey !== candidateConfigKey) return false;
  if (
    candidateSchemaVersion !== undefined &&
    candidateSchemaVersion !== null &&
    candidateSchemaVersion !== currentSchemaVersion
  )
    return false;
  return true;
}

export function pickPreviousAttempt(
  current: CompatibleCandidate & { referenceText: string; id: string; recordedAt: string },
  candidates: Array<CompatibleCandidate & { referenceText: string; id: string; recordedAt: string }>,
  configKeyOf: (
    a: CompatibleCandidate & { referenceText: string; id: string; recordedAt: string },
  ) => string | null,
  schemaVersionOf: (
    a: CompatibleCandidate & { referenceText: string; id: string; recordedAt: string },
  ) => number | null,
): (CompatibleCandidate & { referenceText: string; id: string; recordedAt: string }) | null {
  const currentKey = configKeyOf(current);
  const currentSchema = schemaVersionOf(current) ?? EVALUATION_SCHEMA_VERSION;
  const sorted = [...candidates]
    .filter((c) => c.id !== current.id)
    .filter((c) => c.recordedAt <= current.recordedAt)
    .sort((a, b) =>
      a.recordedAt === b.recordedAt ? (a.id < b.id ? 1 : -1) : a.recordedAt < b.recordedAt ? 1 : -1,
    );
  for (const c of sorted) {
    if (current.stopReason === "limit") return null;
    if (
      isCompatiblePair(current, c, currentKey, configKeyOf(c), currentSchema, schemaVersionOf(c))
    ) {
      return c;
    }
  }
  return null;
}
