import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PracticeEditor from "@/components/practice-editor";
import type { PassageFilterState } from "@/lib/practice-content";

class MockSpeechSynthesisUtterance {
  lang = "";
  voice: SpeechSynthesisVoice | null = null;
  onstart: ((event: SpeechSynthesisEvent) => void) | null = null;
  onend: ((event: SpeechSynthesisEvent) => void) | null = null;
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;

  constructor(public text: string) {}
}

const libraryFilters: PassageFilterState = {
  band: "B1.2",
  topic: "all",
  focus: "all",
  query: "",
};

function renderEditor() {
  return render(
    <PracticeEditor
      draft="She worked hard."
      onDraftChange={vi.fn()}
      onStart={vi.fn()}
      disabled={false}
      selectedPassage={null}
      onSelectPassage={vi.fn()}
      libraryFilters={libraryFilters}
      onLibraryFiltersChange={vi.fn()}
      hideLibraryBrowser
    />,
  );
}

describe("PracticeEditor sample playback", () => {
  const cancel = vi.fn();
  const speak = vi.fn();

  beforeEach(() => {
    cancel.mockReset();
    speak.mockReset();
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel,
        speak,
        getVoices: () => [],
        speaking: false,
        pending: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } satisfies Partial<SpeechSynthesis>,
    });
    vi.stubGlobal("SpeechSynthesisUtterance", MockSpeechSynthesisUtterance);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts idle playback without cancelling, then stops instead of restarting", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: /listen to sample/i }));

    expect(cancel).not.toHaveBeenCalled();
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: "She worked hard." }));
    expect(screen.getByText("Starting sample playback…")).toBeInTheDocument();

    const utterance = speak.mock.calls[0][0] as MockSpeechSynthesisUtterance;
    act(() => utterance.onstart?.({} as SpeechSynthesisEvent));
    expect(await screen.findByText("Playing sample…")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /stop sample playback/i }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Playing sample…")).not.toBeInTheDocument();
  });

  it("returns to idle and exposes playback errors", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: /listen to sample/i }));

    const utterance = speak.mock.calls[0][0] as MockSpeechSynthesisUtterance;
    act(() => utterance.onerror?.({ error: "synthesis-failed" } as SpeechSynthesisErrorEvent));

    expect(await screen.findByText(/sample could not be played/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /listen to sample/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("returns to idle when playback ends", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: /listen to sample/i }));

    const utterance = speak.mock.calls[0][0] as MockSpeechSynthesisUtterance;
    act(() => utterance.onstart?.({} as SpeechSynthesisEvent));
    expect(screen.getByText("Playing sample…")).toBeInTheDocument();

    act(() => utterance.onend?.({} as SpeechSynthesisEvent));
    expect(screen.queryByText("Playing sample…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /listen to sample/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
