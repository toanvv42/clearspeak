import a1Content from "@/content/passages/a1.json";
import a2Content from "@/content/passages/a2.json";
import b1Content from "@/content/passages/b1.json";
import b2Content from "@/content/passages/b2.json";
import c1Content from "@/content/passages/c1.json";
import c2Content from "@/content/passages/c2.json";
import { countWords, normalizeText, validatePassage } from "@/lib/text";

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const PRACTICE_BANDS = ["A1", "A2", "B1.1", "B1.2", "B2", "C1", "C2"] as const;
export const PASSAGE_TOPICS = [
  "daily-life",
  "travel",
  "work-technology",
  "relationships",
  "health-habits",
  "science-environment",
] as const;
export const FOCUS_TAGS = [
  "final-consonants",
  "past-endings",
  "consonant-clusters",
  "word-stress",
  "thought-groups",
  "linking",
  "sentence-stress",
  "request-intonation",
  "contrastive-stress",
  "intonation",
] as const;

export type CefrLevel = (typeof CEFR_LEVELS)[number];
export type PracticeBand = (typeof PRACTICE_BANDS)[number];
export type PassageTopic = (typeof PASSAGE_TOPICS)[number];
export type FocusTag = (typeof FOCUS_TAGS)[number];

type RawChunk = { id: string; text: string };
type RawPassage = {
  id: string;
  version: number;
  title: string;
  text: string;
  cefrLevel: CefrLevel;
  sublevel?: "B1.1" | "B1.2";
  levelRationale: string;
  topic: PassageTopic;
  focusTags: FocusTag[];
  locale: "en-US";
  chunks: RawChunk[];
  source: {
    kind: "original" | "excerpt" | "adaptation";
    author: string;
    attribution: string;
    url?: string;
  };
  rights: {
    status: "cleared" | "unknown";
    license: string;
    evidenceUrl?: string;
    checkedAt: string;
  };
  review: { status: "reviewed" | "draft"; reviewedAt?: string };
};

export type PassageChunk = RawChunk & { start: number; end: number };
export type PracticePassage = Omit<RawPassage, "chunks"> & {
  chunks: PassageChunk[];
  wordCount: number;
  estimatedSeconds: number;
  band: PracticeBand;
};

export type PassageFilters = {
  band?: PracticeBand | "all";
  topic?: PassageTopic | "all";
  focus?: FocusTag | "all";
  query?: string;
};

export type PassageFilterState = {
  band: PracticeBand | "all";
  topic: PassageTopic | "all";
  focus: FocusTag | "all";
  query: string;
};

export const DEFAULT_PASSAGE_FILTERS: PassageFilterState = {
  band: "B1.2",
  topic: "all",
  focus: "all",
  query: "",
};

export const LIBRARY_BAND_COUNTS: Record<PracticeBand, number> = {
  A1: 5,
  A2: 6,
  "B1.1": 7,
  "B1.2": 12,
  B2: 6,
  C1: 4,
  C2: 4,
};

const TARGET_WORD_RANGES: Record<PracticeBand, readonly [number, number]> = {
  A1: [8, 18],
  A2: [15, 25],
  "B1.1": [20, 30],
  "B1.2": [20, 35],
  B2: [25, 40],
  C1: [25, 45],
  C2: [25, 45],
};

const files = [a1Content, a2Content, b1Content, b2Content, c1Content, c2Content] as Array<{
  schemaVersion: number;
  passages: RawPassage[];
}>;

function isOneOf<T extends readonly string[]>(value: string, values: T): value is T[number] {
  return values.includes(value as T[number]);
}

function hydratePassage(raw: RawPassage): PracticePassage {
  const text = normalizeText(raw.text);
  let cursor = 0;
  const chunks = raw.chunks.map((chunk) => {
    const chunkText = normalizeText(chunk.text);
    const start = text.indexOf(chunkText, cursor);
    if (start < 0) throw new Error(`${raw.id}: chunk ${chunk.id} does not match passage text`);
    const end = start + chunkText.length;
    cursor = end;
    return { ...chunk, text: chunkText, start, end };
  });
  const wordCount = countWords(text);
  return {
    ...raw,
    text,
    chunks,
    wordCount,
    estimatedSeconds: Math.max(1, Math.round((wordCount / 120) * 60)),
    band: (raw.sublevel ?? raw.cefrLevel) as PracticeBand,
  };
}

export function validatePracticePassages(passages: PracticePassage[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const normalizedTexts = new Set<string>();

  for (const passage of passages) {
    if (ids.has(passage.id)) errors.push(`Duplicate passage id: ${passage.id}`);
    ids.add(passage.id);
    const normalized = normalizeText(passage.text).toLocaleLowerCase("en-US");
    if (normalizedTexts.has(normalized)) errors.push(`Duplicate passage text: ${passage.id}`);
    normalizedTexts.add(normalized);

    const input = validatePassage(passage.text);
    if (!input.valid) errors.push(`${passage.id}: ${input.errors.join(" ")}`);
    if (!isOneOf(passage.cefrLevel, CEFR_LEVELS)) errors.push(`${passage.id}: invalid CEFR level`);
    if (!isOneOf(passage.band, PRACTICE_BANDS)) errors.push(`${passage.id}: invalid practice band`);
    if (passage.cefrLevel === "B1" && !passage.sublevel) errors.push(`${passage.id}: B1 passage needs a sublevel`);
    if (passage.cefrLevel !== "B1" && passage.sublevel) errors.push(`${passage.id}: only B1 can have a sublevel`);
    if (!isOneOf(passage.topic, PASSAGE_TOPICS)) errors.push(`${passage.id}: invalid topic`);
    if (passage.focusTags.length < 1 || passage.focusTags.length > 2) {
      errors.push(`${passage.id}: include one or two focus tags`);
    }
    if (passage.focusTags.some((tag) => !isOneOf(tag, FOCUS_TAGS))) errors.push(`${passage.id}: invalid focus tag`);
    if (passage.locale !== "en-US") errors.push(`${passage.id}: pilot locale must be en-US`);
    if (passage.source.kind !== "original" && passage.rights.status !== "cleared") {
      errors.push(`${passage.id}: imported content rights are not cleared`);
    }
    if (passage.review.status !== "reviewed") errors.push(`${passage.id}: passage is not reviewed`);
    const [minimumWords, maximumWords] = TARGET_WORD_RANGES[passage.band];
    if (passage.wordCount < minimumWords || passage.wordCount > maximumWords) {
      errors.push(`${passage.id}: ${passage.wordCount} words is outside ${passage.band} target ${minimumWords}-${maximumWords}`);
    }
    if (passage.chunks.length === 0) errors.push(`${passage.id}: passage needs a chunk`);
    passage.chunks.forEach((chunk) => {
      if (passage.text.slice(chunk.start, chunk.end) !== chunk.text) {
        errors.push(`${passage.id}: invalid boundaries for ${chunk.id}`);
      }
    });
  }
  for (const band of PRACTICE_BANDS) {
    const count = passages.filter((passage) => passage.band === band).length;
    if (count !== LIBRARY_BAND_COUNTS[band]) {
      errors.push(`${band}: expected ${LIBRARY_BAND_COUNTS[band]} passages, found ${count}`);
    }
  }
  return errors;
}

const hydrated = files.flatMap((file, index) => {
  if (file.schemaVersion !== 1) throw new Error(`Unsupported passage schema in content file ${index + 1}`);
  return file.passages.map(hydratePassage);
});
const contentErrors = validatePracticePassages(hydrated);
if (contentErrors.length > 0) throw new Error(`Invalid practice content:\n${contentErrors.join("\n")}`);

export const PRACTICE_PASSAGES: readonly PracticePassage[] = hydrated;

export function getPassageById(id: string, version?: number): PracticePassage | undefined {
  return PRACTICE_PASSAGES.find((passage) => passage.id === id && (version === undefined || passage.version === version));
}

export function filterPassages(filters: PassageFilters): PracticePassage[] {
  const normalizeSearchText = (value: string) =>
    normalizeText(value.replace(/[-_&]+/g, " ")).toLocaleLowerCase("en-US");
  const query = normalizeSearchText(filters.query ?? "");
  return PRACTICE_PASSAGES.filter((passage) => {
    if (filters.band && filters.band !== "all" && passage.band !== filters.band) return false;
    if (filters.topic && filters.topic !== "all" && passage.topic !== filters.topic) return false;
    if (filters.focus && filters.focus !== "all" && !passage.focusTags.includes(filters.focus)) return false;
    if (!query) return true;
    const searchable = normalizeSearchText(
      `${passage.title} ${passage.text} ${passage.topic} ${passage.focusTags.join(" ")}`,
    );
    return searchable.includes(query);
  });
}

export function passageIdentity(passage: PracticePassage) {
  return { kind: "library" as const, id: passage.id, version: passage.version };
}

export function customTextIdentity(text: string) {
  const normalized = normalizeText(text);
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return { kind: "custom" as const, hash: (hash >>> 0).toString(36) };
}
