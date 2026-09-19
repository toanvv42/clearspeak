import { stripPunctuation } from "@/lib/text";
import type { AssessedWord } from "@/lib/types";

export type AlignedToken = {
  display: string;
  key: string;
  word: AssessedWord | null;
};

/**
 * Align reference tokens and Azure words using a longest-common-subsequence
 * table. Unlike greedy look-ahead, this keeps the surrounding sequence intact
 * when an earlier repeated word is entirely absent from Azure's result.
 * Unmatched reference tokens remain visible; unmatched assessed words are
 * surfaced as extras. Explicit Azure omission/insertion metadata stays on the
 * original word objects.
 */
export function alignReferenceWords(
  referenceText: string,
  words: AssessedWord[],
): { tokens: AlignedToken[]; extraWords: AssessedWord[] } {
  const normalized = referenceText.replace(/\s+/g, " ").trim();
  const displays = normalized.length === 0 ? [] : normalized.split(" ");
  const referenceKeys = displays.map((display) => stripPunctuation(display).toLowerCase());
  const wordKeys = words.map((word) => stripPunctuation(word.text).toLowerCase());
  const rows = referenceKeys.length;
  const columns = wordKeys.length;

  // dp[i][j] is the number of exact token matches available from the two
  // suffixes. Passages are capped at 60 words, so this is intentionally small.
  const dp = Array.from({ length: rows + 1 }, () => new Uint16Array(columns + 1));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = columns - 1; j >= 0; j--) {
      dp[i][j] =
        referenceKeys[i] !== "" && referenceKeys[i] === wordKeys[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const matches = new Map<number, number>();
  const extraWords: AssessedWord[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < columns) {
    if (referenceKeys[i] !== "" && referenceKeys[i] === wordKeys[j]) {
      matches.set(i, j);
      i++;
      j++;
      continue;
    }
    if (dp[i + 1][j] >= dp[i][j + 1]) {
      // Prefer leaving a reference token unmatched on ties. This prevents a
      // later repeated word from being greedily attached to an earlier gap.
      i++;
    } else {
      extraWords.push(words[j]);
      j++;
    }
  }
  while (j < columns) {
    extraWords.push(words[j]);
    j++;
  }

  const tokens: AlignedToken[] = displays.map((display, index) => {
    const wordIndex = matches.get(index);
    return {
      display,
      key: `${index}-${display}`,
      word: wordIndex === undefined ? null : words[wordIndex],
    };
  });

  return { tokens, extraWords };
}
