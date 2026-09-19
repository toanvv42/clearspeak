import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SaveStatus from "@/components/save-status";
import { useAttemptSave } from "@/hooks/use-attempt-save";
import type { PendingEntry } from "@/lib/history/pending-saves";

const mocks = vi.hoisted(() => ({
  entries: new Map<string, PendingEntry>(),
  storageAvailable: true,
  uploadAttempt: vi.fn(),
  uploadEvaluation: vi.fn(),
}));

vi.mock("@/lib/history/client", () => ({
  getAccessCode: () => "test-code",
  uploadAttempt: mocks.uploadAttempt,
  uploadEvaluation: mocks.uploadEvaluation,
}));

vi.mock("@/lib/history/pending-saves", () => ({
  pendingList: async () => Array.from(mocks.entries.values()),
  pendingPut: async (entry: PendingEntry) => {
    if (!mocks.storageAvailable) return "unavailable";
    mocks.entries.set(entry.id, entry);
    return "ok";
  },
  pendingUpdate: async (id: string, patch: Partial<PendingEntry>) => {
    const entry = mocks.entries.get(id);
    if (entry) mocks.entries.set(id, { ...entry, ...patch });
  },
  pendingRemove: async (id: string) => { mocks.entries.delete(id); },
}));

const payload = { evaluationId: "evaluation", result: { pronunciationScore: 80 } };
const unavailable = () => Object.assign(new Error("Service unavailable"), { status: 503 });
const deleted = () => Object.assign(new Error("Deleted"), { status: 410 });

beforeEach(() => {
  mocks.entries.clear();
  mocks.storageAvailable = true;
  mocks.uploadAttempt.mockReset().mockResolvedValue({});
  mocks.uploadEvaluation.mockReset().mockResolvedValue({ item: { revision: 1 } });
});

describe("feedback recovery", () => {
  it("lets the user retry memory-only feedback from the status UI", async () => {
    mocks.storageAvailable = false;
    mocks.uploadEvaluation.mockRejectedValueOnce(unavailable());
    function Harness() {
      const saver = useAttemptSave();
      return (
        <>
          <button onClick={() => void saver.saveEvaluationPayload("saved-take", payload, false)}>
            Save feedback
          </button>
          <SaveStatus state={saver.state} onRetry={() => void saver.retry()} />
        </>
      );
    }
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Save feedback" }));
    expect(await screen.findByText(/Feedback waiting to sync/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry save" }));
    expect(await screen.findByText("Saved to history")).toBeInTheDocument();
    expect(mocks.uploadEvaluation).toHaveBeenCalledTimes(2);
    expect(mocks.uploadEvaluation).toHaveBeenLastCalledWith("saved-take", payload, "test-code");
    expect(mocks.uploadAttempt).not.toHaveBeenCalled();
  });

  it("updates the visible status after reconnect and does not replay acknowledged feedback", async () => {
    mocks.uploadEvaluation.mockRejectedValueOnce(unavailable());
    const { result } = renderHook(() => useAttemptSave());
    await act(async () => {});
    await act(async () => { await result.current.saveEvaluationPayload("take", payload, false); });
    expect(result.current.state.kind).toBe("feedback-waiting");
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(result.current.state.kind).toBe("saved"));
    await act(async () => { await result.current.drainAll(); });
    expect(result.current.serverId).toBe("take");
    expect(result.current.revision).toBe(1);
    expect(mocks.uploadEvaluation).toHaveBeenCalledTimes(2);
    expect(mocks.entries.size).toBe(0);
  });

  it("retries a live take and its feedback when browser storage is unavailable", async () => {
    mocks.storageAvailable = false;
    mocks.uploadEvaluation.mockRejectedValueOnce(unavailable());
    const { result } = renderHook(() => useAttemptSave());
    await act(async () => {});
    const wav = new Blob(["recording"]);
    const metadata = { referenceText: "Practice this sentence." };
    await act(async () => {
      await result.current.beginTake("take", metadata, wav);
      await result.current.saveEvaluationPayload("take", payload, false);
    });
    await act(async () => { await result.current.retry(); });
    expect(mocks.uploadAttempt).toHaveBeenLastCalledWith("take", metadata, wav, "test-code");
    expect(mocks.uploadEvaluation).toHaveBeenCalledTimes(2);
    expect(result.current.state.kind).toBe("saved");
  });

  it.each([true, false])("continues after a deleted evaluation (persisted: %s)", async (persisted) => {
    const { result } = renderHook(() => useAttemptSave());
    await act(async () => {});
    mocks.storageAvailable = persisted;
    mocks.uploadEvaluation.mockRejectedValue(unavailable());
    await act(async () => { await result.current.saveEvaluationPayload("deleted", payload, false); });
    mocks.storageAvailable = false;
    act(() => result.current.reset());
    await act(async () => { await result.current.saveEvaluationPayload("next", payload, false); });
    mocks.uploadEvaluation.mockClear().mockImplementation(async (id: string) => {
      if (id === "deleted") throw deleted();
      return { item: { revision: 2 } };
    });
    await act(async () => { await result.current.drainAll(); });
    expect(mocks.uploadEvaluation.mock.calls.map(([id]) => id)).toEqual(["deleted", "next"]);
    expect(mocks.entries.size).toBe(0);
    expect(result.current.state.kind).toBe("saved");
    expect(result.current.serverId).toBe("next");
    await act(async () => { await result.current.drainAll(); });
    expect(mocks.uploadEvaluation).toHaveBeenCalledTimes(2);
  });

  it.each(["drainAll", "retry"] as const)("clears both copies when the audio upload reports deletion during %s", async (method) => {
    const { result } = renderHook(() => useAttemptSave());
    await act(async () => {});
    mocks.uploadAttempt.mockRejectedValueOnce(unavailable());
    mocks.uploadEvaluation.mockRejectedValueOnce(unavailable());
    await act(async () => {
      await result.current.beginTake("deleted", {}, new Blob(["audio"]));
      await result.current.saveEvaluationPayload("deleted", payload, false);
    });
    mocks.uploadAttempt.mockRejectedValue(deleted());
    mocks.uploadEvaluation.mockClear();
    await act(async () => { await result.current[method](); });
    await act(async () => { await result.current.drainAll(); });
    expect(mocks.entries.size).toBe(0);
    expect(mocks.uploadEvaluation).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ kind: "unsaved", canRetry: false });
  });

  it("keeps failed-assessment metadata retryable until it is saved", async () => {
    mocks.storageAvailable = false;
    mocks.uploadEvaluation.mockRejectedValueOnce(unavailable());
    const { result } = renderHook(() => useAttemptSave());
    await act(async () => {});
    const failure = { failure: { kind: "network", message: "Assessment failed" } };
    await act(async () => { await result.current.saveEvaluationPayload("take", failure, true); });
    expect(result.current.state.kind).toBe("feedback-waiting");
    await act(async () => { await result.current.retry(); });
    expect(result.current.state.kind).toBe("eval-failed");
  });

  it("does not replace the current take status when an older evaluation syncs", async () => {
    mocks.storageAvailable = false;
    mocks.uploadEvaluation.mockRejectedValueOnce(unavailable());
    const { result } = renderHook(() => useAttemptSave());
    await act(async () => {});
    await act(async () => { await result.current.saveEvaluationPayload("old", payload, false); });
    await act(async () => { await result.current.beginTake("new", {}, new Blob(["audio"])); });
    await act(async () => { await result.current.drainAll(); });
    expect(result.current.state.kind).toBe("saved-analyzing");
    expect(result.current.serverId).toBe("new");
  });

  it("does not offer retry for a deleted take", () => {
    render(<SaveStatus state={{ kind: "unsaved", canRetry: false }} onRetry={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Retry save" })).not.toBeInTheDocument();
  });
});
