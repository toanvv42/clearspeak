export const REFERENCE_VOICE_STORAGE_KEY = "clearspeak-reference-voice";
export const REFERENCE_RATE_STORAGE_KEY = "clearspeak-reference-rate";

export function voiceId(voice: Pick<SpeechSynthesisVoice, "voiceURI" | "name" | "lang">): string {
  return voice.voiceURI || `${voice.name}:${voice.lang}`;
}

export function isGoogleUsEnglishVoice(
  voice: Pick<SpeechSynthesisVoice, "name" | "lang">,
): boolean {
  return voice.lang.toLowerCase().startsWith("en-us") && voice.name.toLowerCase().includes("google");
}

export function rankEnglishVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const score = (voice: SpeechSynthesisVoice) => {
    const language = voice.lang.toLowerCase();
    const google = voice.name.toLowerCase().includes("google");
    if (google && language.startsWith("en-us")) return 0;
    if (language.startsWith("en-us")) return 1;
    if (google && language.startsWith("en")) return 2;
    return 3;
  };

  return voices
    .filter((voice) => voice.lang.toLowerCase().startsWith("en"))
    .sort((left, right) => score(left) - score(right) || left.name.localeCompare(right.name));
}

export function preferredEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return rankEnglishVoices(voices)[0];
}

export function chooseReferenceVoice(
  voices: SpeechSynthesisVoice[],
  currentId: string,
  savedId: string,
): SpeechSynthesisVoice | undefined {
  if (savedId) {
    const saved = voices.find((voice) => voiceId(voice) === savedId);
    if (saved) return saved;
  }
  if (currentId) {
    const current = voices.find((voice) => voiceId(voice) === currentId);
    if (current) return current;
  }
  return preferredEnglishVoice(voices);
}
