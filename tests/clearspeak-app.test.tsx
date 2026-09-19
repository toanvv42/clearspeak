import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ClearSpeakApp from "@/components/clearspeak-app";
import type { AssessmentResult } from "@/lib/types";

type MockRecorder = {
  status: string;
  elapsedMs: number;
  level: number;
  error: string | null;
  finished: { blob: Blob; url: string; durationMs: number } | null;
  autoStopped: boolean;
  finishing: boolean;
  start: () => Promise<{ ok: true } | { ok: false; unsupported: boolean; message: string }>;
  finish: () => Promise<void>;
  cancel: () => void;
  teardown: () => void;
};

const mockRecorder: MockRecorder = {
  status: "idle",
  elapsedMs: 0,
  level: 0,
  error: null,
  finished: null,
  autoStopped: false,
  finishing: false,
  start: async () => ({ ok: true }),
  finish: async () => {},
  cancel: () => {},
  teardown: () => {},
};

(globalThis as unknown as Record<string, unknown>).__mockRecorder = mockRecorder;

vi.mock("@/hooks/use-pcm-recorder", () => ({
  usePcmRecorder: (options?: { onAutoStop?: () => void }) => {
    (globalThis as unknown as Record<string, unknown>).__hookState = { options: options ?? {} };
    return (globalThis as unknown as Record<string, unknown>).__mockRecorder;
  },
}));

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return { ...actual, useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" };
});

const SYNTHETIC_RESULT: AssessmentResult = {
  referenceText: "She worked hard.",
  recognizedText: "She worked hard.",
  pronunciationScore: 78,
  accuracyScore: 55,
  fluencyScore: 88,
  completenessScore: 100,
  words: [
    {
      text: "worked",
      accuracyScore: 50,
      errorType: "Mispronunciation",
      syllables: [],
      phonemes: [
        { symbol: "w", accuracyScore: 90, position: "initial", alternatives: [] },
        {
          symbol: "t",
          accuracyScore: 30,
          position: "final",
          alternatives: [{ symbol: "d", confidence: 62 }],
        },
      ],
    },
    {
      text: "hard",
      accuracyScore: 85,
      errorType: "None",
      syllables: [],
      phonemes: [{ symbol: "h", accuracyScore: 85, position: "only", alternatives: [] }],
    },
  ],
  insertedWords: [],
};

const assessWavFileMock = vi.hoisted(() => vi.fn());
const fetchSpeechTokenMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/azure/pronunciation", () => ({
  fetchSpeechToken: fetchSpeechTokenMock,
  assessWavFile: assessWavFileMock,
  classifyAssessmentError: () => ({
    kind: "generic",
    message: "Something went wrong during assessment.",
    nextAction: "Try again.",
  }),
}));

function resetMock() {
  mockRecorder.status = "idle";
  mockRecorder.elapsedMs = 0;
  mockRecorder.level = 0;
  mockRecorder.error = null;
  mockRecorder.finished = null;
  mockRecorder.autoStopped = false;
  mockRecorder.start = async () => {
    mockRecorder.status = "recording";
    return { ok: true };
  };
  mockRecorder.finish = async () => {
    mockRecorder.finished = {
      blob: new Blob(["fake-audio"], { type: "audio/wav" }),
      url: "blob:fake-recording",
      durationMs: 5000,
    };
    mockRecorder.status = "stopped";
  };
  mockRecorder.cancel = () => {
    mockRecorder.status = "idle";
    mockRecorder.finished = null;
  };
  assessWavFileMock.mockClear();
  assessWavFileMock.mockImplementation(async () => SYNTHETIC_RESULT);
  fetchSpeechTokenMock.mockClear();
  fetchSpeechTokenMock.mockImplementation(async () => ({
    token: "tok",
    region: "southeastasia",
    expiresAt: new Date(Date.now() + 9 * 60 * 1000).toISOString(),
    enableProsody: false,
  }));
}

describe("ClearSpeakApp", () => {
  beforeEach(() => {
    resetMock();
    if (!URL.createObjectURL) {
      (URL as unknown as Record<string, unknown>).createObjectURL = () => "blob:fake";
    }
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    window.speechSynthesis = {
      cancel: vi.fn(),
      speak: vi.fn(),
      getVoices: () => [],
    } as unknown as SpeechSynthesis;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates the passage and shows word counts", async () => {
    const user = userEvent.setup();
    render(<ClearSpeakApp accessRequired={false} />);
    const start = screen.getByRole("button", { name: /start recording/i });
    expect(start).toBeDisabled();
    const box = screen.getByLabelText(/your practice text/i);
    await user.type(box, "She worked hard.");
    expect(screen.getByText(/3 words/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start recording/i })).toBeEnabled();
  });

  it("starts the library at B1.2 and treats edited selections as custom text", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ClearSpeakApp accessRequired={false} />);
    await user.click(screen.getByRole("button", { name: /browse practice texts/i }));
    expect(screen.getByLabelText(/practice level/i)).toHaveValue("B1.2");
    expect(screen.getByText("12 texts")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /use this text/i })[0]);
    const box = screen.getByLabelText(/your practice text/i);
    expect((box as HTMLTextAreaElement).value).toContain("project");
    expect(screen.getByText(/checking the project · b1.2/i)).toBeInTheDocument();

    await user.type(box, " One more sentence.");
    expect(screen.queryByText(/checking the project · b1.2/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /start recording/i }));
    rerender(<ClearSpeakApp accessRequired={false} />);
    expect(await screen.findByText("Custom text")).toBeInTheDocument();
  });

  it("keeps library filters after selection and a recording round trip", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ClearSpeakApp accessRequired={false} />);
    await user.click(screen.getByRole("button", { name: /browse practice texts/i }));
    await user.selectOptions(screen.getByLabelText(/practice level/i), "A2");
    expect(screen.getByText("6 texts")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /use this text/i })[0]);
    await user.click(screen.getByRole("button", { name: /browse practice texts/i }));
    expect(screen.getByLabelText(/practice level/i)).toHaveValue("A2");
    expect(screen.getByText("6 texts")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close library/i }));
    await user.click(screen.getByRole("button", { name: /start recording/i }));
    rerender(<ClearSpeakApp accessRequired={false} />);
    await user.click(await screen.findByRole("button", { name: /^cancel$/i }));
    rerender(<ClearSpeakApp accessRequired={false} />);

    await user.click(screen.getByRole("button", { name: /browse practice texts/i }));
    expect(screen.getByLabelText(/practice level/i)).toHaveValue("A2");
    expect(screen.getByText("6 texts")).toBeInTheDocument();
  });

  it("records, analyzes, and shows accessible results with replay", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ClearSpeakApp accessRequired={false} />);
    await user.type(screen.getByLabelText(/your practice text/i), "She worked hard.");
    await user.click(screen.getByRole("button", { name: /start recording/i }));
    rerender(<ClearSpeakApp accessRequired={false} />);

    expect(await screen.findByRole("button", { name: /finish & analyze/i })).toBeInTheDocument();
    expect(screen.getByText("She worked hard.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /finish & analyze/i }));
    rerender(<ClearSpeakApp accessRequired={false} />);

    expect(await screen.findByText(/sounds to fix/i)).toBeInTheDocument();
    // Weakest sound ranked first with N-best alternative and careful ending alert.
    expect(screen.getByText(/practice the ending/i)).toBeInTheDocument();
    expect(screen.getByText(/needs attention/)).toBeInTheDocument();
    expect(screen.getByLabelText(/your last recording playback/i)).toHaveAttribute(
      "src",
      "blob:fake-recording",
    );
    // Word chips expose word + status in accessible names.
    expect(screen.getByRole("button", { name: /worked, focus/i })).toBeInTheDocument();
    expect(assessWavFileMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /^try again$/i }));
    expect(screen.getByLabelText(/your practice text/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/your last recording playback/i)).toHaveAttribute(
      "src",
      "blob:fake-recording",
    );
  });

  it("explains the 30-second auto-stop", async () => {
    const user = userEvent.setup();
    mockRecorder.finish = async () => {
      mockRecorder.finished = {
        blob: new Blob(["x"], { type: "audio/wav" }),
        url: "blob:auto",
        durationMs: 30000,
      };
      mockRecorder.status = "stopped";
    };
    const { rerender } = render(<ClearSpeakApp accessRequired={false} />);
    await user.type(screen.getByLabelText(/your practice text/i), "She worked hard.");
    await user.click(screen.getByRole("button", { name: /start recording/i }));
    rerender(<ClearSpeakApp accessRequired={false} />);
    // Simulate the recorder's 30-second timer notification and completed audio.
    await act(async () => {
      await mockRecorder.finish();
      const state = (globalThis as unknown as Record<string, { options: { onAutoStop?: () => void } }>).__hookState;
      state.options.onAutoStop?.();
    });
    rerender(<ClearSpeakApp accessRequired={false} />);
    expect(await screen.findByText(/30-second limit was reached/i)).toBeInTheDocument();
  });

  it("shows a retry path after assessment failure", async () => {
    const user = userEvent.setup();
    assessWavFileMock.mockRejectedValueOnce(new Error("boom"));
    const { rerender } = render(<ClearSpeakApp accessRequired={false} />);
    await user.type(screen.getByLabelText(/your practice text/i), "She worked hard.");
    await user.click(screen.getByRole("button", { name: /start recording/i }));
    rerender(<ClearSpeakApp accessRequired={false} />);
    await user.click(await screen.findByRole("button", { name: /finish & analyze/i }));
    rerender(<ClearSpeakApp accessRequired={false} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^try again$/i }));
    expect(screen.getByLabelText(/your practice text/i)).toBeInTheDocument();
  });

  it("stops speech synthesis on unmount", async () => {
    const { unmount } = render(<ClearSpeakApp accessRequired={false} />);
    await act(async () => {
      unmount();
    });
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
  });

  it("gates access when required", () => {
    render(<ClearSpeakApp accessRequired={true} />);
    expect(screen.getByLabelText(/access code/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/your practice text/i)).not.toBeInTheDocument();
  });

  it("rejects a wrong access code before any recording", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      Response.json({ error: "That access code wasn't recognized.", code: "invalid_code" }, { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(<ClearSpeakApp accessRequired={true} />);
      await user.type(screen.getByLabelText(/access code/i), "wrong-code");
      await user.click(screen.getByRole("button", { name: /^unlock$/i }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/wasn't recognized/);
      expect(screen.queryByLabelText(/your practice text/i)).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("unlocks with a server-validated code", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true }, { status: 200 })));
    try {
      render(<ClearSpeakApp accessRequired={true} />);
      await user.type(screen.getByLabelText(/access code/i), "right-code");
      await user.click(screen.getByRole("button", { name: /^unlock$/i }));
      expect(await screen.findByLabelText(/your practice text/i)).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("submits analysis exactly once on rapid double Finish", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ClearSpeakApp accessRequired={false} />);
    await user.type(screen.getByLabelText(/your practice text/i), "She worked hard.");
    await user.click(screen.getByRole("button", { name: /start recording/i }));
    rerender(<ClearSpeakApp accessRequired={false} />);
    const finish = await screen.findByRole("button", { name: /finish & analyze/i });
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.click(finish);
    fireEvent.click(finish);
    rerender(<ClearSpeakApp accessRequired={false} />);
    expect(await screen.findByText(/sounds to fix/i)).toBeInTheDocument();
    expect(fetchSpeechTokenMock).toHaveBeenCalledTimes(1);
    expect(assessWavFileMock).toHaveBeenCalledTimes(1);
  });

  it("shows the due-practice queue and practices a due passage inline", async () => {
    const user = userEvent.setup();
    const { PRACTICE_PASSAGES } = await import("@/lib/practice-content");
    const passage = PRACTICE_PASSAGES[0];
    const weekly = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-09-${String(13 + i).padStart(2, "0")}`,
      attempts: i === 6 ? 1 : 0,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes("/api/progress")) {
          return Response.json({
            totals: { attempts: 1, practiceDays: 1 },
            due: [
              {
                targetKey: `library:${passage.id}:${passage.version}`,
                kind: "library",
                title: passage.title,
                passageId: passage.id,
                passageVersion: passage.version,
                latestAttemptId: "11111111-1111-4111-8111-111111111111",
                lastPracticedAt: "2026-09-10T10:00:00.000Z",
                nextDueAt: "2026-09-11T10:00:00.000Z",
                intervalStep: 0,
                practiceCount: 1,
                lastScore: 70,
              },
            ],
            weekly,
            favourites: [],
            stats: [],
          });
        }
        if (u.includes("/api/attempts")) return Response.json({ items: [], nextCursor: null });
        throw new Error(`unexpected fetch ${u}`);
      }),
    );
    let box: HTMLTextAreaElement;
    try {
      const { rerender } = render(<ClearSpeakApp accessRequired={false} />);
      expect(await screen.findByText(/due for review/i)).toBeInTheDocument();
      expect(screen.getByText(passage.title)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /^practice$/i }));
      rerender(<ClearSpeakApp accessRequired={false} />);
      box = screen.getByLabelText(/your practice text/i) as HTMLTextAreaElement;
      expect(box.value).toBe(passage.text);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps the previous try for comparison after Try again", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ClearSpeakApp accessRequired={false} />);
    await user.type(screen.getByLabelText(/your practice text/i), "She worked hard.");
    await user.click(screen.getByRole("button", { name: /start recording/i }));
    rerender(<ClearSpeakApp accessRequired={false} />);
    await user.click(await screen.findByRole("button", { name: /finish & analyze/i }));
    rerender(<ClearSpeakApp accessRequired={false} />);
    expect(await screen.findByText(/sounds to fix/i)).toBeInTheDocument();
    expect(screen.getByText(/practise the ending/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^try again$/i }));
    rerender(<ClearSpeakApp accessRequired={false} />);
    await user.click(screen.getByRole("button", { name: /start recording/i }));
    rerender(<ClearSpeakApp accessRequired={false} />);
    await user.click(await screen.findByRole("button", { name: /finish & analyze/i }));
    rerender(<ClearSpeakApp accessRequired={false} />);
    expect(await screen.findByText(/compared with your previous try/i)).toBeInTheDocument();
  });
});
