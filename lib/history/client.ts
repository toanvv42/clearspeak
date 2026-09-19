"use client";

import type { AttemptDetail, AttemptSummary } from "@/lib/history/types";
import type {
  DueReviewItem,
  FavouritePassage,
  TargetStats,
  WeeklyPracticeCount,
} from "@/lib/review-schedule";
import { getAccessCode as readStoredCode } from "@/lib/access-code";

export function getAccessCode(): string | undefined {
  return readStoredCode();
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

export type ProgressOverview = {
  totals: { attempts: number; practiceDays: number };
  due: DueReviewItem[];
  weekly: WeeklyPracticeCount[];
  favourites: FavouritePassage[];
  stats: TargetStats[];
};

export async function fetchProgress(accessCode?: string): Promise<ProgressOverview> {
  const res = await fetch("/api/progress", { headers: headers(accessCode ?? getAccessCode()) });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw Object.assign(new Error((body as { error?: string })?.error ?? "Could not load progress."), {
      status: res.status,
    });
  }
  return (await res.json()) as ProgressOverview;
}

export async function fetchFavourites(accessCode?: string): Promise<{ items: FavouritePassage[] }> {
  const res = await fetch("/api/favourites", { headers: headers(accessCode ?? getAccessCode()) });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw Object.assign(new Error((body as { error?: string })?.error ?? "Could not load favourites."), {
      status: res.status,
    });
  }
  return (await res.json()) as { items: FavouritePassage[] };
}

export async function addFavouriteRequest(
  passageId: string,
  passageVersion: number,
  accessCode?: string,
): Promise<{ item: FavouritePassage }> {
  const res = await fetch("/api/favourites", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers(accessCode ?? getAccessCode()) },
    body: JSON.stringify({ passageId, passageVersion }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw Object.assign(new Error((body as { error?: string })?.error ?? "Could not save favourite."), {
      status: res.status,
    });
  }
  return (await res.json()) as { item: FavouritePassage };
}

export async function removeFavouriteRequest(targetKey: string, accessCode?: string): Promise<void> {
  const res = await fetch(`/api/favourites?target=${encodeURIComponent(targetKey)}`, {
    method: "DELETE",
    headers: headers(accessCode ?? getAccessCode()),
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.json().catch(() => null);
    throw Object.assign(new Error((body as { error?: string })?.error ?? "Could not delete favourite."), {
      status: res.status,
    });
  }
}

export async function downloadHistoryExport(accessCode?: string): Promise<void> {
  const code = accessCode ?? getAccessCode();
  const res = await fetch("/api/attempts/export", { headers: headers(code) });
  if (!res.ok) throw Object.assign(new Error("Could not export history."), { status: res.status });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `clearspeak-history-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
