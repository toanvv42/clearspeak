import { beforeEach, describe, expect, it, vi } from "vitest";

const sdkState = vi.hoisted(() => ({ recognizers: [] as Array<Record<string, unknown>> }));

vi.mock("microsoft-cognitiveservices-speech-sdk", () => {
  class FakeRecognizer {
    close = vi.fn();
    okCb: ((res: unknown) => void) | null = null;
    errCb: ((err: unknown) => void) | null = null;
    constructor(
      public speechConfig: unknown,
      public audioConfig: unknown,
    ) {
      sdkState.recognizers.push(this as unknown as Record<string, unknown>);
    }
    recognizeOnceAsync(ok: (res: unknown) => void, err: (e: unknown) => void) {
      this.okCb = ok;
      this.errCb = err;
    }
  }
  return {
    OutputFormat: { Detailed: 1 },
    ResultReason: { RecognizedSpeech: 0, NoMatch: 1, Canceled: 2 },
    PropertyId: { SpeechServiceResponse_JsonResult: "SpeechServiceResponse_JsonResult" },
    PronunciationAssessmentGradingSystem: { HundredMark: 2 },
    PronunciationAssessmentGranularity: { Phoneme: 1 },
    SpeechConfig: {
      fromAuthorizationToken: (token: string, region: string) => ({
        token,
        region,
        speechRecognitionLanguage: "",
        outputFormat: 0,
        close: vi.fn(),
      }),
    },
    AudioConfig: {
      fromWavFileInput: (file: unknown) => ({ file, close: vi.fn() }),
    },
    PronunciationAssessmentConfig: class {
      phonemeAlphabet = "";
      nbestPhonemeCount = 0;
      enableProsodyAssessment = false;
      applyTo = vi.fn();
      constructor(
        public referenceText: string,
        public grading: number,
        public granularity: number,
        public miscue: boolean,
      ) {}
    },
    SpeechRecognizer: FakeRecognizer,
    CancellationDetails: {
      fromResult: () => ({ reason: "Error", errorDetails: "mock cancellation" }),
    },
  };
});

import { ASSESSMENT_TIMEOUT_MS, assessWavFile } from "@/lib/azure/pronunciation";

function token() {
  return {
    token: "tok",
    region: "southeastasia",
    expiresAt: new Date(Date.now() + 9 * 60 * 1000).toISOString(),
    enableProsody: false,
  };
}

function wav() {
  return new Blob(["fake"], { type: "audio/wav" });
}

function recognizedResult(display: string) {
  return {
    reason: 0,
    text: display,
    properties: { getProperty: () => JSON.stringify({ NBest: [{ Display: display }] }) },
  };
}

beforeEach(() => {
  sdkState.recognizers.length = 0;
  vi.useRealTimers();
});

describe("assessWavFile abort and timeout", () => {
  it("rejects immediately when already aborted, without starting recognition", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      assessWavFile({ wavBlob: wav(), referenceText: "hi", token: token(), signal: controller.signal }),
    ).rejects.toThrow(/cancelled/i);
    expect(sdkState.recognizers).toHaveLength(0);
  });

  it("settles promptly on abort during recognition", async () => {
    const controller = new AbortController();
    const pending = assessWavFile({
      wavBlob: wav(),
      referenceText: "hi",
      token: token(),
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(sdkState.recognizers).toHaveLength(1));
    controller.abort();
    await expect(pending).rejects.toThrow(/cancelled/i);
    const rec = sdkState.recognizers[0];
    expect(rec["close"]).toHaveBeenCalled();
  });

  it("cleans up when aborted while the SDK import is resolving", async () => {
    const controller = new AbortController();
    const pending = assessWavFile({
      wavBlob: wav(),
      referenceText: "hi",
      token: token(),
      signal: controller.signal,
    });
    // assessWavFile has passed its initial check but is currently yielded at
    // the dynamic SDK import.
    controller.abort();
    await expect(pending).rejects.toThrow(/cancelled/i);
    await vi.waitFor(() => expect(sdkState.recognizers).toHaveLength(1));
    expect(sdkState.recognizers[0]["close"]).toHaveBeenCalled();
  });

  it("ignores a late SDK callback after abort", async () => {
    const controller = new AbortController();
    const pending = assessWavFile({
      wavBlob: wav(),
      referenceText: "hi",
      token: token(),
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(sdkState.recognizers).toHaveLength(1));
    const rec = sdkState.recognizers[0] as unknown as {
      okCb: ((res: unknown) => void) | null;
      close: ReturnType<typeof vi.fn>;
    };
    controller.abort();
    await expect(pending).rejects.toThrow(/cancelled/i);
    const closes = rec.close.mock.calls.length;
    rec.okCb?.(recognizedResult("hi"));
    await new Promise((r) => setTimeout(r, 20));
    expect(rec.close).toHaveBeenCalledTimes(closes);
    await expect(pending).rejects.toThrow(/cancelled/i);
  });

  it("rejects on timeout when the SDK never calls back", async () => {
    vi.useFakeTimers();
    const pending = assessWavFile({ wavBlob: wav(), referenceText: "hi", token: token() });
    await vi.waitFor(() => expect(sdkState.recognizers).toHaveLength(1));
    const assertion = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(ASSESSMENT_TIMEOUT_MS + 1000);
    await assertion;
    vi.useRealTimers();
  });

  it("still resolves a normal recognition", async () => {
    const pending = assessWavFile({ wavBlob: wav(), referenceText: "hi", token: token() });
    await vi.waitFor(() => expect(sdkState.recognizers).toHaveLength(1));
    const rec = sdkState.recognizers[0] as unknown as { okCb: ((res: unknown) => void) | null };
    rec.okCb?.(recognizedResult("hi"));
    const result = await pending;
    expect(result.recognizedText).toBe("hi");
  });
});
