import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PracticeEditor from "@/components/practice-editor";
import type { PassageFilterState } from "@/lib/practice-content";

class MockSpeechSynthesisUtterance {
  lang = "";
  rate = 1;
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
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: "She worked hard.", rate: 1 }));
    expect(screen.getByText(/starting sample playback/i)).toBeInTheDocument();

    const utterance = speak.mock.calls[0][0] as MockSpeechSynthesisUtterance;
    act(() => utterance.onstart?.({} as SpeechSynthesisEvent));
    expect(await screen.findByText(/playing sample/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /stop sample playback/i }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/playing sample/i)).not.toBeInTheDocument();
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
    expect(screen.getByText(/playing sample/i)).toBeInTheDocument();

    act(() => utterance.onend?.({} as SpeechSynthesisEvent));
    expect(screen.queryByText(/playing sample/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /listen to sample/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("plays slowly at 0.7 rate when Slow is selected", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("radio", { name: "Slow" }));
    expect(screen.getByRole("radio", { name: "Slow" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: /listen to sample/i }));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ rate: 0.7 }));
  });

  it("replays an individual sentence instead of the full passage", async () => {
    const user = userEvent.setup();
    render(
      <PracticeEditor
        draft="She worked hard. He stayed late."
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
    await user.selectOptions(screen.getByLabelText("Listen to", { selector: "select" }), "sentence-2");
    await user.click(screen.getByRole("button", { name: /listen to sample/i }));
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: "He stayed late." }));
  });

  it("warns when no US English voice is available", async () => {
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel,
        speak,
        getVoices: () => [{ name: "Daniel", lang: "en-GB", voiceURI: "daniel", default: false, localService: true }],
        speaking: false,
        pending: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } satisfies Partial<SpeechSynthesis>,
    });
    renderEditor();
    expect(await screen.findByText(/no us english voice found/i)).toBeInTheDocument();
  });

  it("stops sample playback before starting the microphone", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <PracticeEditor
        draft="She worked hard."
        onDraftChange={vi.fn()}
        onStart={onStart}
        disabled={false}
        selectedPassage={null}
        onSelectPassage={vi.fn()}
        libraryFilters={libraryFilters}
        onLibraryFiltersChange={vi.fn()}
        hideLibraryBrowser
      />,
    );
    await user.click(screen.getByRole("button", { name: /listen to sample/i }));
    expect(speak).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: /start recording/i }));
    expect(cancel).toHaveBeenCalled();
    expect(onStart).toHaveBeenCalledWith("She worked hard.");
  });
});
