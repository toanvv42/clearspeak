import { describe, expect, it } from "vitest";
import {
  EXTERNAL_EVALUATION,
  validateExternalEvaluation,
} from "@/lib/external-evaluation";
import {
  EXTERNAL_RESOURCES,
  validateExternalResources,
} from "@/lib/external-resources";

describe("external resources", () => {
  it("keeps curated recommendations link-only with valid publishers and bands", () => {
    expect(EXTERNAL_RESOURCES.length).toBeGreaterThan(0);
    expect(validateExternalResources([...EXTERNAL_RESOURCES])).toEqual([]);
    for (const resource of EXTERNAL_RESOURCES) {
      expect(resource.url).toMatch(/^https:/);
    }
  });

  it("records the VOA/Tatoeba evaluation with zero bundled imports", () => {
    expect(validateExternalEvaluation()).toEqual([]);
    expect(EXTERNAL_EVALUATION.voaCandidates).toHaveLength(10);
    expect(EXTERNAL_EVALUATION.tatoebaCandidates).toHaveLength(10);
    expect(EXTERNAL_EVALUATION.publishedCount).toBe(0);
    for (const candidate of [
      ...EXTERNAL_EVALUATION.voaCandidates,
      ...EXTERNAL_EVALUATION.tatoebaCandidates,
    ]) {
      expect(candidate.sourceId).not.toBe("");
      expect(candidate.title).not.toBe("");
      expect(candidate.url).toMatch(/^https:/);
      expect(candidate.rights.textEvidenceUrl).toMatch(/^https:/);
      expect(candidate.rights.audioEvidenceUrl).toMatch(/^https:/);
    }
  });
});
