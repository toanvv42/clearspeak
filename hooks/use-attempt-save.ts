"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAccessCode, uploadAttempt, uploadEvaluation } from "@/lib/history/client";
import {
  pendingList,
  pendingPut,
  pendingRemove,
  pendingUpdate,
} from "@/lib/history/pending-saves";

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved-analyzing" }
  | { kind: "saved" }
  | { kind: "device-only" }
  | { kind: "feedback-waiting" }
  | { kind: "unsaved"; canRetry: boolean }
  | { kind: "eval-failed" };

export function saveStatusCopy(state: SaveState): string {
  switch (state.kind) {
    case "idle":
      return "";
    case "saving":
      return "Saving recording…";
    case "saved-analyzing":
      return "Recording saved · Analyzing…";
    case "saved":
      return "Saved to history";
    case "device-only":
      return "Saved on this device · Waiting to sync";
    case "feedback-waiting":
      return "Recording saved · Feedback waiting to sync";
    case "unsaved":
      return "Not saved — keep this tab open";
    case "eval-failed":
      return "Recording saved · Evaluation failed";
  }
}

export function useAttemptSave() {
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const [serverId, setServerId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [queueFull, setQueueFull] = useState(false);
  const currentRef = useRef<{ id: string; metadata: Record<string, unknown>; wav: Blob } | null>(null);
  const accessRef = useRef<string | undefined>(undefined);
  const displayedIdRef = useRef<string | null>(null);
  /**
   * Memory fallback for evaluation payloads when IndexedDB is unavailable,
   * plus queued entries for re-evaluations of server-saved takes (beginTake
   * was never called for them, so pendingUpdate alone would be a no-op).
   * Entries stay here until the server acknowledges them.
   */
  const memoryEvalRef = useRef(new Map<string, { payload: Record<string, unknown>; isFailure: boolean }>());

  const removePending = useCallback(async (id: string) => {
    await pendingRemove(id);
    memoryEvalRef.current.delete(id);
  }, []);

  const syncEvaluation = useCallback(async (id: string, payload: Record<string, unknown>) => {
    try {
      const res = await uploadEvaluation(id, payload, getAccessCode());
      await removePending(id);
      if (displayedIdRef.current === id) {
        setRevision(res.item.revision);
        setServerId(id);
        setState(payload.failure ? { kind: "eval-failed" } : { kind: "saved" });
      }
      return true;
    } catch (err) {
      if ((err as { status?: number }).status === 410) {
        await removePending(id);
        if (displayedIdRef.current === id) {
          setServerId(null);
          setState({ kind: "unsaved", canRetry: false });
        }
        return true;
      }
      if (displayedIdRef.current === id) setState({ kind: "feedback-waiting" });
      return false;
    }
  }, [removePending]);

  const drainOne = useCallback(async (id: string) => {
    const entries = await pendingList();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return true;
    const code = getAccessCode();
    if (!entry.audioSaved) {
      try {
        await uploadAttempt(entry.id, entry.metadata, entry.wav, code);
        await pendingUpdate(entry.id, { audioSaved: true });
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 400 || status === 409 || status === 410 || status === 413) {
          if ((err as { code?: string }).code === "deleted" || status === 410) {
            await removePending(entry.id);
            if (displayedIdRef.current === entry.id) {
              setServerId(null);
              setState({ kind: "unsaved", canRetry: false });
            }
            return true;
          }
          if (status === 400 || status === 413) return false;
        }
        if (status === 401) return false;
        return false;
      }
    }
    if (entry.evaluation) {
      return syncEvaluation(entry.id, entry.evaluation);
    }
    // Audio-only entry stays until evaluation arrives; audio is durable.
    return true;
  }, [removePending, syncEvaluation]);

  const drainAll = useCallback(async () => {
    const entries = await pendingList();
    for (const e of entries) {
      // Pace uploads and stop on a retryable failure.
      const ok = await drainOne(e.id);
      if (!ok) return;
      await new Promise((r) => setTimeout(r, 150));
    }
    // Flush memory-only evaluation payloads (IndexedDB unavailable).
    for (const [id, mem] of Array.from(memoryEvalRef.current)) {
      const listed = await pendingList();
      if (listed.some((e) => e.id === id && e.evaluation)) continue;
      if (!(await syncEvaluation(id, mem.payload))) return;
      await new Promise((r) => setTimeout(r, 150));
    }
  }, [drainOne, syncEvaluation]);

  useEffect(() => {
    accessRef.current = getAccessCode();
    // Status updates happen after asynchronous storage/network operations.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void drainAll();
    const onOnline = () => void drainAll();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [drainAll]);

  const beginTake = useCallback(
    async (id: string, metadata: Record<string, unknown>, wav: Blob) => {
      currentRef.current = { id, metadata, wav };
      displayedIdRef.current = id;
      accessRef.current = getAccessCode();
      setServerId(null);
      setRevision(0);
      setQueueFull(false);
      setState({ kind: "saving" });
      const stored = await pendingPut({
        id,
        metadata,
        wav,
        evaluation: null,
        audioSaved: false,
        updatedAt: Date.now(),
      });
      if (stored === "full") {
        setQueueFull(true);
        setState({ kind: "unsaved", canRetry: true });
        return;
      }
      if (stored === "unavailable") {
        // Memory-only fallback: try direct upload without IDB.
      }
      try {
        await uploadAttempt(id, metadata, wav, accessRef.current);
        await pendingUpdate(id, { audioSaved: true });
        setServerId(id);
        setState({ kind: "saved-analyzing" });
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 409 || status === 410) {
          setState({ kind: "unsaved", canRetry: status !== 410 });
          return;
        }
        // Keep IDB copy when available; otherwise in-memory retry.
        const entries = await pendingList();
        setState(entries.some((e) => e.id === id) ? { kind: "device-only" } : { kind: "unsaved", canRetry: true });
      }
    },
    [],
  );

  const saveEvaluationPayload = useCallback(
    async (id: string, payload: Record<string, unknown>, isFailure: boolean) => {
      if (displayedIdRef.current === null) displayedIdRef.current = id;
      memoryEvalRef.current.set(id, { payload, isFailure });
      await pendingUpdate(id, { evaluation: payload, updatedAt: Date.now() });
      // Re-evaluating an existing history item has no queued entry to update
      // (beginTake never ran for it). Ensure one exists so a failed upload
      // stays retryable; audio is already on the server.
      try {
        const entries = await pendingList();
        if (!entries.some((e) => e.id === id)) {
          const take = currentRef.current?.id === id ? currentRef.current : null;
          await pendingPut({
            id,
            metadata: take?.metadata ?? {},
            wav: take?.wav ?? new Blob([]),
            evaluation: payload,
            audioSaved: take === null,
            updatedAt: Date.now(),
          });
        }
      } catch {
        /* ignore: memory fallback covers this take */
      }
      await syncEvaluation(id, payload);
    },
    [syncEvaluation],
  );

  const markEvalFailed = useCallback(() => {
    setState((s) => (s.kind === "saved" ? s : { kind: "eval-failed" }));
  }, []);

  const retry = useCallback(async () => {
    const cur = currentRef.current;
    if (!cur) {
      // Saved history items use the same drain and deletion handling as
      // automatic reconnects, including uploading queued audio first.
      setState({ kind: "saving" });
      await drainAll();
      setState((s) => s.kind === "saving" ? { kind: "feedback-waiting" } : s);
      return;
    }
    setState({ kind: "saving" });
    const entries = await pendingList();
    const entry = entries.find((e) => e.id === cur.id);
    const wav = entry?.wav && entry.wav.size > 0 ? entry.wav : cur.wav;
    const metadata =
      entry?.metadata && Object.keys(entry.metadata).length > 0 ? entry.metadata : cur.metadata;
    try {
      await uploadAttempt(cur.id, metadata, wav, getAccessCode());
      await pendingUpdate(cur.id, { audioSaved: true });
      setServerId(cur.id);
      const updated = (await pendingList()).find((e) => e.id === cur.id);
      const mem = memoryEvalRef.current.get(cur.id);
      const evalPayload = (updated?.evaluation ?? mem?.payload) as Record<string, unknown> | undefined;
      if (evalPayload) {
        const isFailure = !((evalPayload as { result?: unknown }).result);
        await saveEvaluationPayload(cur.id, evalPayload, isFailure);
      } else {
        setState({ kind: "saved-analyzing" });
      }
    } catch (err) {
      if ((err as { status?: number }).status === 410) {
        await removePending(cur.id);
        setServerId(null);
        setState({ kind: "unsaved", canRetry: false });
        return;
      }
      setState({ kind: "unsaved", canRetry: true });
    }
  }, [drainAll, removePending, saveEvaluationPayload]);

  const reset = useCallback(() => {
    currentRef.current = null;
    displayedIdRef.current = null;
    setState({ kind: "idle" });
    setServerId(null);
    setRevision(0);
  }, []);

  return {
    state,
    statusCopy: saveStatusCopy(state),
    serverId,
    revision,
    queueFull,
    beginTake,
    saveEvaluationPayload,
    markEvalFailed,
    retry,
    reset,
    drainAll,
  };
}
