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

  const drainOne = useCallback(async (id: string) => {
    const entries = await pendingList();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return true;
    const code = accessRef.current ?? getAccessCode();
    if (!entry.audioSaved) {
      try {
        await uploadAttempt(entry.id, entry.metadata, entry.wav, code);
        await pendingUpdate(entry.id, { audioSaved: true });
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 400 || status === 409 || status === 410 || status === 413) {
          if ((err as { code?: string }).code === "deleted" || status === 410) {
            await pendingRemove(entry.id);
            return true;
          }
          if (status === 400 || status === 413) return false;
        }
        if (status === 401) return false;
        return false;
      }
    }
    if (entry.evaluation) {
      try {
        await uploadEvaluation(entry.id, entry.evaluation, code);
        await pendingRemove(entry.id);
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 401) return false;
        if (status === 409 || status === 410) {
          if (status === 410) await pendingRemove(entry.id);
          return status === 410;
        }
        return false;
      }
    } else {
      // Audio-only entry stays until evaluation arrives; audio is durable.
      return true;
    }
    return true;
  }, []);

  const drainAll = useCallback(async () => {
    const entries = await pendingList();
    for (const e of entries) {
      // Sequential with bounded backoff: stop on auth failure.
      const ok = await drainOne(e.id);
      if (!ok) break;
      await new Promise((r) => setTimeout(r, 150));
    }
  }, [drainOne]);

  useEffect(() => {
    accessRef.current = getAccessCode();
    void drainAll();
    const onOnline = () => void drainAll();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [drainAll]);

  const beginTake = useCallback(
    async (id: string, metadata: Record<string, unknown>, wav: Blob) => {
      currentRef.current = { id, metadata, wav };
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
      await pendingUpdate(id, { evaluation: payload, updatedAt: Date.now() });
      try {
        const res = await uploadEvaluation(id, payload, accessRef.current ?? getAccessCode());
        await pendingRemove(id);
        setRevision(res.item.revision);
        setServerId(id);
        setState(isFailure ? { kind: "eval-failed" } : { kind: "saved" });
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 401) {
          setState({ kind: "feedback-waiting" });
          return;
        }
        // Audio is saved; evaluation sync pending.
        setState(isFailure ? { kind: "eval-failed" } : { kind: "feedback-waiting" });
      }
    },
    [],
  );

  const markEvalFailed = useCallback(() => {
    setState((s) => (s.kind === "saved" ? s : { kind: "eval-failed" }));
  }, []);

  const retry = useCallback(async () => {
    const cur = currentRef.current;
    if (!cur) return;
    setState({ kind: "saving" });
    const entries = await pendingList();
    const entry = entries.find((e) => e.id === cur.id);
    const wav = entry?.wav ?? cur.wav;
    const metadata = entry?.metadata ?? cur.metadata;
    try {
      await uploadAttempt(cur.id, metadata, wav, getAccessCode());
      await pendingUpdate(cur.id, { audioSaved: true });
      setServerId(cur.id);
      const updated = (await pendingList()).find((e) => e.id === cur.id);
      if (updated?.evaluation) {
        await saveEvaluationPayload(cur.id, updated.evaluation, false);
      } else {
        setState({ kind: "saved-analyzing" });
      }
    } catch {
      setState({ kind: "unsaved", canRetry: true });
    }
  }, [saveEvaluationPayload]);

  const reset = useCallback(() => {
    currentRef.current = null;
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
