export type PhonemePosition = "initial" | "medial" | "final" | "only";

export type PhonemeAlternative = {
  symbol: string;
  confidence?: number;
};

export type AssessedPhoneme = {
  symbol: string;
  accuracyScore?: number;
  position: PhonemePosition;
  alternatives: PhonemeAlternative[];
};

export type AssessedSyllable = {
  text: string;
  accuracyScore?: number;
  errorType?: string;
  offset?: number;
  duration?: number;
};

export type AssessedWord = {
  /** Surface form from Azure (no surrounding punctuation). */
  text: string;
  accuracyScore?: number;
  errorType?: string;
  offset?: number;
  duration?: number;
  syllables: AssessedSyllable[];
  phonemes: AssessedPhoneme[];
};

export type AssessmentResult = {
  referenceText: string;
  recognizedText: string;
  pronunciationScore?: number;
  accuracyScore?: number;
  fluencyScore?: number;
  completenessScore?: number;
  prosodyScore?: number;
  words: AssessedWord[];
  insertedWords: AssessedWord[];
};

export type SpeechTokenResponse = {
  token: string;
  region: string;
  expiresAt: string;
  enableProsody: boolean;
};

export type SpeechTokenError = {
  error: string;
  code: string;
};

export type ScoreBand = "strong" | "review" | "focus" | "omitted";

export type PracticePhase =
  | "locked"
  | "editing"
  | "requesting-microphone"
  | "recording"
  | "preparing-audio"
  | "requesting-token"
  | "assessing"
  | "success"
  | "recoverable-error";

export type AssessmentErrorKind =
  | "permission-denied"
  | "unsupported-browser"
  | "no-speech"
  | "auth"
  | "quota"
  | "network"
  | "offline"
  | "timeout"
  | "too-short"
  | "cancelled"
  | "invalid-credentials"
  | "generic";

export type AssessmentFailure = {
  kind: AssessmentErrorKind;
  message: string;
  nextAction: string;
};
