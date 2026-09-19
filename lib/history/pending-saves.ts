"use client";

export type PendingEntry = {
  id: string;
  metadata: Record<string, unknown>;
  wav: Blob;
  evaluation: Record<string, unknown> | null;
  audioSaved: boolean;
  updatedAt: number;
};

const DB_NAME = "clearspeak-pending";
const STORE = "pending";
export const PENDING_MAX_COUNT = 20;
export const PENDING_MAX_BYTES = 25 * 1024 * 1024;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb-unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexeddb-open-failed"));
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let req: IDBRequest<T>;
        try {
          req = fn(store);
        } catch (err) {
          db.close();
          reject(err);
          return;
        }
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("indexeddb-failed"));
        t.oncomplete = () => db.close();
        t.onerror = () => {
          db.close();
          reject(t.error ?? new Error("indexeddb-failed"));
        };
      }),
  );
}

type StoredEntry = {
  id: string;
  metadata: Record<string, unknown>;
  wav: Blob;
  evaluation: Record<string, unknown> | null;
  audioSaved: boolean;
  updatedAt: number;
};

export async function pendingList(): Promise<PendingEntry[]> {
  try {
    const all = await tx<StoredEntry[]>("readonly", (s) => s.getAll());
    return (all ?? []).sort((a, b) => a.updatedAt - b.updatedAt);
  } catch {
    return [];
  }
}

export async function pendingPut(entry: PendingEntry): Promise<"ok" | "unavailable" | "full"> {
  try {
    const all = await pendingList();
    const bytes = all.reduce((n, e) => n + (e.wav?.size ?? 0), 0) + (entry.wav?.size ?? 0);
    const exists = all.some((e) => e.id === entry.id);
    if (!exists && (all.length >= PENDING_MAX_COUNT || bytes > PENDING_MAX_BYTES)) {
      // Only audio-only entries are safe to evict. Uploaded audio does not
      // mean its queued feedback has reached the server.
      const evictable = all
        .filter((e) => e.audioSaved && e.evaluation === null)
        .sort((a, b) => a.updatedAt - b.updatedAt);
      for (const victim of evictable) {
        await pendingRemove(victim.id);
        const rest = await pendingList();
        const restBytes =
          rest.reduce((n, e) => n + (e.wav?.size ?? 0), 0) + (entry.wav?.size ?? 0);
        if (rest.length < PENDING_MAX_COUNT && restBytes <= PENDING_MAX_BYTES) break;
      }
      const after = await pendingList();
      const afterBytes =
        after.reduce((n, e) => n + (e.wav?.size ?? 0), 0) + (entry.wav?.size ?? 0);
      if (!after.some((e) => e.id === entry.id) && (after.length >= PENDING_MAX_COUNT || afterBytes > PENDING_MAX_BYTES))
        return "full";
    }
    await tx("readwrite", (s) => s.put(entry as StoredEntry));
    return "ok";
  } catch {
    return "unavailable";
  }
}

export async function pendingUpdate(id: string, patch: Partial<PendingEntry>): Promise<void> {
  try {
    const current = await tx<StoredEntry | undefined>("readonly", (s) => s.get(id));
    if (!current) return;
    await tx("readwrite", (s) => s.put({ ...current, ...patch, id }));
  } catch {
    /* ignore: memory fallback covers this take */
  }
}

export async function pendingRemove(id: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    /* ignore */
  }
}
