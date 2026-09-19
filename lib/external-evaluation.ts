import evaluationContent from "@/content/external-evaluation.json";

export type ExternalCandidateRights = {
  textStatus: "cleared" | "not-cleared";
  textLicense: string;
  textEvidenceUrl: string;
  attribution: string;
  audioStatus: "cleared" | "not-cleared" | "not-offered";
  audioLicense: string;
  audioEvidenceUrl: string;
};

export type ExternalCandidate = {
  slot: string;
  publisher: "VOA Learning English" | "Tatoeba";
  sourceId: string;
  title: string;
  url: string;
  checkedAt: string;
  intendedUse: "passage-with-audio" | "sentence-drill";
  decision: "excluded" | "published";
  rights: ExternalCandidateRights;
  reason: string;
};

const rawEvaluation = evaluationContent as {
  schemaVersion: number;
  evaluatedAt: string;
  policy: string;
  publishedCount: number;
  voaCandidates: ExternalCandidate[];
  tatoebaCandidates: ExternalCandidate[];
};

if (rawEvaluation.schemaVersion !== 1) throw new Error("Unsupported external evaluation schema");

export const EXTERNAL_EVALUATION = rawEvaluation;

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function validateExternalEvaluation(): string[] {
  const errors: string[] = [];
  const slots = new Set<string>();
  const sourceKeys = new Set<string>();
  const groups = [
    ["VOA Learning English", rawEvaluation.voaCandidates],
    ["Tatoeba", rawEvaluation.tatoebaCandidates],
  ] as const;

  for (const [expectedPublisher, candidates] of groups) {
    for (const candidate of candidates) {
      const sourceKey = `${candidate.publisher}:${candidate.sourceId}`;
      if (slots.has(candidate.slot)) errors.push(`Duplicate evaluation slot: ${candidate.slot}`);
      if (sourceKeys.has(sourceKey)) errors.push(`Duplicate external candidate: ${sourceKey}`);
      slots.add(candidate.slot);
      sourceKeys.add(sourceKey);

      if (candidate.publisher !== expectedPublisher) errors.push(`${candidate.slot}: wrong publisher`);
      if (candidate.sourceId.trim().length === 0) errors.push(`${candidate.slot}: missing source id`);
      if (candidate.title.trim().length === 0) errors.push(`${candidate.slot}: missing title`);
      if (!isHttpsUrl(candidate.url)) errors.push(`${candidate.slot}: candidate URL must be https`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.checkedAt)) errors.push(`${candidate.slot}: invalid checked date`);
      if (candidate.reason.trim().length === 0) errors.push(`${candidate.slot}: missing reason`);
      if (candidate.rights.attribution.trim().length === 0) errors.push(`${candidate.slot}: missing attribution`);
      if (candidate.rights.textLicense.trim().length === 0) errors.push(`${candidate.slot}: missing text licence`);
      if (!isHttpsUrl(candidate.rights.textEvidenceUrl)) errors.push(`${candidate.slot}: invalid text evidence URL`);
      if (candidate.rights.audioLicense.trim().length === 0) errors.push(`${candidate.slot}: missing audio licence review`);
      if (!isHttpsUrl(candidate.rights.audioEvidenceUrl)) errors.push(`${candidate.slot}: invalid audio evidence URL`);
      if (candidate.decision === "published" && candidate.rights.textStatus !== "cleared") {
        errors.push(`${candidate.slot}: published candidate text rights are not cleared`);
      }
      if (candidate.decision === "published" && candidate.intendedUse === "passage-with-audio" && candidate.rights.audioStatus !== "cleared") {
        errors.push(`${candidate.slot}: published audio rights are not cleared`);
      }
    }
  }

  if (rawEvaluation.voaCandidates.length < 10) errors.push("Expected at least 10 VOA candidates evaluated");
  if (rawEvaluation.tatoebaCandidates.length < 10) errors.push("Expected at least 10 Tatoeba candidates evaluated");
  const candidates = [...rawEvaluation.voaCandidates, ...rawEvaluation.tatoebaCandidates];
  const published = candidates.filter((candidate) => candidate.decision === "published").length;
  if (published !== rawEvaluation.publishedCount) {
    errors.push(`Published count mismatch: header ${rawEvaluation.publishedCount}, rows ${published}`);
  }
  return errors;
}

const evaluationErrors = validateExternalEvaluation();
if (evaluationErrors.length > 0) throw new Error(`Invalid external evaluation:\n${evaluationErrors.join("\n")}`);
