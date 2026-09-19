import { describe, expect, it } from "vitest";
import {
  isGoogleUsEnglishVoice,
  preferredEnglishVoice,
  rankEnglishVoices,
  voiceId,
} from "@/lib/reference-voice";

function voice(name: string, lang: string, uri = name): SpeechSynthesisVoice {
  return { name, lang, voiceURI: uri, default: false, localService: true };
}

describe("reference voices", () => {
  it("prefers Google US English over the macOS default voice", () => {
    const samantha = voice("Samantha", "en-US");
    const google = voice("Google US English", "en-US");
    const british = voice("Google UK English Female", "en-GB");

    expect(preferredEnglishVoice([samantha, british, google])).toBe(google);
    expect(rankEnglishVoices([samantha, british, google])).toEqual([google, samantha, british]);
    expect(isGoogleUsEnglishVoice(google)).toBe(true);
    expect(isGoogleUsEnglishVoice(samantha)).toBe(false);
  });

  it("filters non-English voices and creates a fallback id", () => {
    expect(rankEnglishVoices([voice("Thomas", "fr-FR"), voice("Alex", "en-US")])).toHaveLength(1);
    expect(voiceId(voice("Alex", "en-US", ""))).toBe("Alex:en-US");
  });
});
