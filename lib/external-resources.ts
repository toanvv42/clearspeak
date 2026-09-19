import resourcesContent from "@/content/external-resources.json";
import type { PracticeBand } from "@/lib/practice-content";
import { PRACTICE_BANDS } from "@/lib/practice-content";

export const EXTERNAL_PUBLISHERS = ["BBC", "British Council", "VOA Learning English", "Tatoeba"] as const;

export type ExternalPublisher = (typeof EXTERNAL_PUBLISHERS)[number];

export type ExternalResource = {
  id: string;
  title: string;
  url: string;
  publisher: ExternalPublisher;
  accentLabel: string;
  suggestedBands: PracticeBand[];
  rightsNote: string;
};

const rawResources = resourcesContent as {
  schemaVersion: number;
  notice: string;
  resources: ExternalResource[];
};

if (rawResources.schemaVersion !== 1) throw new Error("Unsupported external resources schema");

export const EXTERNAL_RESOURCES_NOTICE = rawResources.notice;
export const EXTERNAL_RESOURCES: readonly ExternalResource[] = rawResources.resources;

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateExternalResources(resources: readonly ExternalResource[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const resource of resources) {
    if (ids.has(resource.id)) errors.push(`Duplicate external resource id: ${resource.id}`);
    ids.add(resource.id);
    if (!isHttpUrl(resource.url)) errors.push(`${resource.id}: external URL must be https`);
    if (!(EXTERNAL_PUBLISHERS as readonly string[]).includes(resource.publisher)) {
      errors.push(`${resource.id}: unknown publisher`);
    }
    if (resource.accentLabel.trim().length === 0) errors.push(`${resource.id}: missing accent label`);
    if (resource.rightsNote.trim().length === 0) errors.push(`${resource.id}: missing rights note`);
    if (resource.suggestedBands.length === 0) errors.push(`${resource.id}: no suggested bands`);
    for (const band of resource.suggestedBands) {
      if (!(PRACTICE_BANDS as readonly string[]).includes(band)) {
        errors.push(`${resource.id}: invalid suggested band ${band}`);
      }
    }
    const record = resource as unknown as Record<string, unknown>;
    if ("transcript" in record || "audio" in record || "audioUrl" in record) {
      errors.push(`${resource.id}: link-only resources must not embed transcripts or audio`);
    }
  }
  return errors;
}

const resourceErrors = validateExternalResources(EXTERNAL_RESOURCES);
if (resourceErrors.length > 0) throw new Error(`Invalid external resources:\n${resourceErrors.join("\n")}`);
