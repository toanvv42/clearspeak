"use client";

import { parsePronunciationJson } from "@/lib/azure/result-parser";
import type { AssessmentFailure, AssessmentResult, SpeechTokenResponse } from "@/lib/types";

export const ASSESSMENT_TIMEOUT_MS = 60000;

export function classifyAssessmentError(err: unknown): AssessmentFailure {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? "");
  const lower = raw.toLowerCase();
  if (/no match|nomatch|no speech|babble|initialsilence/i.test(raw)) {
    return {
      kind: "no-speech",
      message: "Azure could not detect speech in your recording.",
      nextAction: "Move closer to the microphone, read the passage aloud, and try again.",
    };
  }
  if (/401|unauthorized|authentication|forbidden|403|invalid subscription|invalid credentials/i.test(raw)) {
    return {
      kind: "invalid-credentials",
      message: "Azure rejected the speech credentials. The key, region, or token may be wrong.",
      nextAction: "Check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in your .env.local, restart the server, and try again.",
    };
  }
  if (/429|too many requests|throttle|quota|concurrent|410/i.test(raw)) {
    return {
      kind: "quota",
      message: "The free Azure tier allows only one request at a time and it may be throttled.",
      nextAction: "Wait about 30 seconds, then try again.",
    };
  }
  if (/timeout|timed out/i.test(raw)) {
    return {
      kind: "timeout",
      message: "The assessment timed out before Azure responded.",
      nextAction: "Check your connection and try again.",
    };
  }
  if (/network|failed to fetch|econn|enotfound|websocket/i.test(lower)) {
    return {
      kind: "network",
      message: "Could not reach Azure Speech from your browser.",
      nextAction: "Check your internet connection and try again.",
    };
  }
  return {
    kind: "generic",
    message: "Something went wrong during assessment.",
    nextAction: "Try again. If it keeps failing, restart the app and check your Azure setup.",
  };
}

export async function fetchSpeechToken(accessCode?: string): Promise<SpeechTokenResponse> {
  const res = await fetch("/api/speech-token", {
    method: "POST",
    headers: accessCode ? { "x-app-access-code": accessCode } : {},
  });
  if (res.status === 401) {
    const failure: AssessmentFailure = {
      kind: "auth",
      message: "The app access code was missing or incorrect.",
      nextAction: "Unlock the app with your personal access code and try again.",
    };
    throw Object.assign(new Error("Unauthorized"), { assessmentFailure: failure, status: 401 });
  }
  if (res.status === 429) {
    const failure: AssessmentFailure = {
      kind: "quota",
      message: "Too many token requests. Please wait a moment.",
      nextAction: "Wait about a minute, then try again.",
    };
    throw Object.assign(new Error("Rate limited"), { assessmentFailure: failure, status: 429 });
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Token request failed (${res.status})`);
  }
  return (await res.json()) as SpeechTokenResponse;
}

export type AssessWavOptions = {
  wavBlob: Blob;
  referenceText: string;
  token: SpeechTokenResponse;
  signal?: AbortSignal;
};

/**
 * One-shot file assessment. The WAV never touches the Next.js server:
 * it goes directly from the browser to Azure via the Speech SDK.
 */
export async function assessWavFile({
  wavBlob,
  referenceText,
  token,
  signal,
}: AssessWavOptions): Promise<AssessmentResult> {
  if (typeof window === "undefined") throw new Error("Assessment must run in the browser");
  if (!window.isSecureContext && window.location.hostname !== "localhost") {
    throw new Error("Microphone and speech assessment require HTTPS (localhost is OK for development)");
  }
  if (signal?.aborted) throw new Error("Assessment was cancelled.");
  const SpeechSDK = await import("microsoft-cognitiveservices-speech-sdk");

  const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token.token, token.region);
  speechConfig.speechRecognitionLanguage = "en-US";
  speechConfig.outputFormat = SpeechSDK.OutputFormat.Detailed;

  const wavFile = new File([wavBlob], "recording.wav", { type: "audio/wav" });
  const audioConfig = SpeechSDK.AudioConfig.fromWavFileInput(wavFile);
  const pronunciationConfig = new SpeechSDK.PronunciationAssessmentConfig(
    referenceText,
    SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
    SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
    true,
  );
  pronunciationConfig.phonemeAlphabet = "IPA";
  pronunciationConfig.nbestPhonemeCount = 5;
  if (token.enableProsody) {
    pronunciationConfig.enableProsodyAssessment = true;
  }

  const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
  pronunciationConfig.applyTo(recognizer);

  // Settles exactly once. Late SDK callbacks after abort/timeout are ignored,
  // and cleanup stays idempotent.
  let settled = false;
  const cleanup = () => {
    if (settled) return;
    settled = true;
    try {
      recognizer.close();
    } catch {
      /* ignore */
    }
    try {
      audioConfig.close();
    } catch {
      /* ignore */
    }
    try {
      speechConfig.close();
    } catch {
      /* ignore */
    }
  };

  return new Promise<AssessmentResult>((resolve, reject) => {
    const done = (fn: () => AssessmentResult | never) => {
      if (settled) return;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      let value: AssessmentResult;
      try {
        value = fn();
      } catch (err) {
        cleanup();
        reject(err);
        return;
      }
      cleanup();
      resolve(value);
    };
    const fail = (err: unknown) => {
      done(() => {
        throw err instanceof Error ? err : new Error(String(err));
      });
    };
    const onAbort = () => fail(new Error("Assessment was cancelled."));
    const onTimeout = () =>
      fail(new Error(`Assessment timed out after ${ASSESSMENT_TIMEOUT_MS}ms`));

    // Initialize the timer before any abort path can call done(). Register the
    // listener before checking again so an abort during SDK loading cannot be
    // missed between the check and registration.
    const timer = setTimeout(onTimeout, ASSESSMENT_TIMEOUT_MS);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }

    const handleResult = (
      result: import("microsoft-cognitiveservices-speech-sdk").SpeechRecognitionResult,
    ): AssessmentResult => {
      const reason = result.reason;
      if (reason === SpeechSDK.ResultReason.RecognizedSpeech) {
        const raw = (result.properties.getProperty(
          SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult,
        ) ?? "") as string;
        if (!raw) {
          return {
            referenceText,
            recognizedText: result.text ?? "",
            words: [],
            insertedWords: [],
          };
        }
        return parsePronunciationJson(raw, referenceText);
      }
      if (reason === SpeechSDK.ResultReason.NoMatch) {
        throw new Error("NoMatch: Azure detected no speech in the audio");
      }
      const cancellation = SpeechSDK.CancellationDetails.fromResult(result);
      throw new Error(`${cancellation.reason}: ${cancellation.errorDetails}`);
    };

    try {
      recognizer.recognizeOnceAsync(
        (res) => done(() => handleResult(res)),
        (err) => fail(new Error(typeof err === "string" ? err : "Recognition failed")),
      );
    } catch (err) {
      fail(err);
    }
  });
}
