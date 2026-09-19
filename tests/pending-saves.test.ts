import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pendingList, pendingPut, PENDING_MAX_COUNT, type PendingEntry } from "@/lib/history/pending-saves";

const entries = new Map<string, PendingEntry>();

// Minimal asynchronous storage adapter: exercise the real queue capacity and
// eviction logic without depending on browser persistence in jsdom.
function request<T>(operation: () => T): IDBRequest<T> {
  const req = {} as IDBRequest<T>;
  queueMicrotask(() => {
    Object.defineProperty(req, "result", { value: operation() });
    req.onsuccess?.call(req, new Event("success"));
  });
  return req;
}

beforeEach(() => {
  entries.clear();
  const database = {
    close: vi.fn(),
    transaction: () => ({
      objectStore: () => ({
        getAll: () => request(() => Array.from(entries.values())),
        put: (entry: PendingEntry) => request(() => {
          entries.set(entry.id, entry);
          return entry.id;
        }),
        delete: (id: string) => request(() => { entries.delete(id); }),
      }),
    }),
  };
  vi.stubGlobal("indexedDB", { open: () => request(() => database) });
});

afterEach(() => vi.unstubAllGlobals());

function entry(id: string, overrides: Partial<PendingEntry> = {}): PendingEntry {
  return {
    id,
    metadata: {},
    wav: new Blob(["audio"]),
    audioSaved: true,
    evaluation: { result: { pronunciationScore: 80 } },
    updatedAt: Number(id),
    ...overrides,
  };
}

describe("pending save eviction", () => {
  it("preserves every unsynced evaluation when the queue is full", async () => {
    for (let i = 0; i < PENDING_MAX_COUNT; i++) entries.set(String(i), entry(String(i)));
    expect(await pendingPut(entry("new", { audioSaved: false, evaluation: null }))).toBe("full");
    expect((await pendingList()).map((e) => e.id)).toEqual(
      Array.from({ length: PENDING_MAX_COUNT }, (_, i) => String(i)),
    );
  });

  it("evicts only uploaded audio without pending feedback", async () => {
    for (let i = 0; i < PENDING_MAX_COUNT; i++) entries.set(String(i), entry(String(i)));
    entries.set("1", entry("1", { evaluation: null }));
    expect(await pendingPut(entry("new", { audioSaved: false, evaluation: null }))).toBe("ok");
    expect(entries.has("0")).toBe(true);
    expect(entries.has("1")).toBe(false);
    expect(entries.has("new")).toBe(true);
    expect(entries.size).toBe(PENDING_MAX_COUNT);
  });

  it("does not evict recordings whose audio has not uploaded", async () => {
    for (let i = 0; i < PENDING_MAX_COUNT; i++) {
      entries.set(String(i), entry(String(i), { audioSaved: false, evaluation: null }));
    }
    expect(await pendingPut(entry("new"))).toBe("full");
    expect(entries.size).toBe(PENDING_MAX_COUNT);
    expect(entries.has("0")).toBe(true);
  });
});
