export const MAX_WORDS = 60;
export const MIN_WORDS = 1;
export const MAX_CHARS = 600;

export const SAMPLE_TEXT =
  "The morning sun warmed the quiet garden as birds sang softly above the flowers. She walked slowly along the path, breathing deeply and enjoying the peaceful moment before work.";

export function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function countWords(normalized: string): number {
  if (normalized.length === 0) return 0;
  return normalized.split(" ").filter((w) => w.length > 0).length;
}

/** Split on whitespace, preserving each token's punctuation exactly. */
export function tokenizeReference(text: string): string[] {
  const normalized = normalizeText(text);
  if (normalized.length === 0) return [];
  return normalized.split(" ");
}

/** Strip leading/trailing punctuation for comparison, keeping internal apostrophes/hyphens. */
export function stripPunctuation(token: string): string {
  return token.replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, "");
}

export type PassageValidation = {
  normalized: string;
  charCount: number;
  wordCount: number;
  valid: boolean;
  errors: string[];
};

export function validatePassage(input: string): PassageValidation {
  const normalized = normalizeText(input);
  const charCount = normalized.length;
  const wordCount = countWords(normalized);
  const errors: string[] = [];
  if (wordCount < MIN_WORDS) {
    errors.push("Enter at least 1 word to practice.");
  }
  if (wordCount > MAX_WORDS) {
    errors.push(
      `Keep it to ${MAX_WORDS} words or fewer so the recording stays under 30 seconds (currently ${wordCount}).`,
    );
  }
  if (charCount > MAX_CHARS) {
    errors.push(
      `Keep it to ${MAX_CHARS} characters or fewer so the recording stays under 30 seconds (currently ${charCount}).`,
    );
  }
  return { normalized, charCount, wordCount, valid: errors.length === 0, errors };
}

export function sampleWordCount(): number {
  return countWords(normalizeText(SAMPLE_TEXT));
}
