"use client";

import type { AttemptDetail, AttemptSummary } from "@/lib/history/types";

export function getAccessCode(): string | undefined {
  try {
    return sessionStorage.getItem("clearspeak-access") ?? undefined;
  } catch {
    return undefined;
  }
}

function headers(accessCode?: string): HeadersInit {
  return accessCode ? { "x-app-access-code": accessCode } : {};
}

export async function uploadAttempt(
  id: string,
  metadata: Record<string, unknown>,
  wav: Blob,
  accessCode?: string,
): Promise<{ item: AttemptSummary; created: boolean }> {
  const form = new FormData();
  form.append("metadata", JSON.stringify(metadata));
  form.append("wav", wav, "recording.wav");
  const res = await fetch(`/api/attempts/${id}`, {
    method: "PUT",
    headers: headers(accessCode ?? getAccessCode()),
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw Object.assign(new Error((body as { error?: string })?.error ?? `Upload failed (${res.status})`), {
      status: res.status,
      code: (body as { code?: string })?.code ?? "upload_failed",
    });
  }
  return (await res.json()) as { item: AttemptSummary; created: boolean };
}

export async function uploadEvaluation(
  id: string,
  payload: Record<string, unknown>,
  accessCode?: string,
): Promise<{ item: AttemptDetail }> {
  const res = await fetch(`/api/attempts/${id}/evaluation`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers(accessCode ?? getAccessCode()) },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw Object.assign(new Error((body as { error?: string })?.error ?? `Save failed (${res.status})`), {
      status: res.status,
      code: (body as { code?: string })?.code ?? "save_failed",
    });
  }
  return (await res.json()) as { item: AttemptDetail };
}

export async function fetchAttemptList(
  params: { search?: string; filter?: string; cursor?: string; limit?: number },
  accessCode?: string,
): Promise<{ items: AttemptSummary[]; nextCursor: string | null }> {
  const q = new URLSearchParams();
  if (params.search) q.set("q", params.search);
  if (params.filter) q.set("filter", params.filter);
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.limit) q.set("limit", String(params.limit));
  const res = await fetch(`/api/attempts?${q.toString()}`, { headers: headers(accessCode ?? getAccessCode()) });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw Object.assign(new Error((body as { error?: string })?.error ?? "Could not load history."), {
      status: res.status,
    });
  }
  return (await res.json()) as { items: AttemptSummary[]; nextCursor: string | null };
}

export async function fetchAttemptDetail(id: string, accessCode?: string): Promise<AttemptDetail> {
  const res = await fetch(`/api/attempts/${id}`, { headers: headers(accessCode ?? getAccessCode()) });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw Object.assign(new Error((body as { error?: string })?.error ?? "Not found."), {
      status: res.status,
    });
  }
  const data = (await res.json()) as { item: AttemptDetail };
  return data.item;
}

export async function fetchAttemptAudioBlob(id: string, accessCode?: string): Promise<Blob> {
  const res = await fetch(`/api/attempts/${id}/audio`, {
    headers: headers(accessCode ?? getAccessCode()),
  });
  if (!res.ok) throw Object.assign(new Error("Could not load audio."), { status: res.status });
  return await res.blob();
}

export async function deleteAttemptRequest(id: string, accessCode?: string): Promise<void> {
  const res = await fetch(`/api/attempts/${id}`, {
    method: "DELETE",
    headers: headers(accessCode ?? getAccessCode()),
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.json().catch(() => null);
    throw Object.assign(new Error((body as { error?: string })?.error ?? "Delete failed."), {
      status: res.status,
    });
  }
}
