"use client";

const KEY = "clearspeak-access";
const CHANGE_EVENT = "clearspeak-access-change";
let memoryAccessCode: string | undefined;

function notifyAccessCodeChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Personal access code storage. Long-lived on purpose: one unlock lasts
 * across tabs and browser restarts on this device. The code is still only
 * ever sent as the `x-app-access-code` header — never in URLs or logs.
 * A 401 from any API call clears it and shows the gate again.
 */
export function getAccessCode(): string | undefined {
  if (typeof window === "undefined") return undefined;
  if (memoryAccessCode) return memoryAccessCode;
  try {
    // Fall back to a pre-existing session copy from before the migration.
    memoryAccessCode = localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY) ?? undefined;
    return memoryAccessCode;
  } catch {
    return memoryAccessCode;
  }
}

export function hasAccessCode(): boolean {
  return getAccessCode() != null;
}

export function setAccessCode(code: string): void {
  memoryAccessCode = code;
  try {
    localStorage.setItem(KEY, code);
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage may be blocked */
  }
  notifyAccessCodeChanged();
}

export function clearAccessCode(): void {
  memoryAccessCode = undefined;
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  notifyAccessCodeChanged();
}

export function subscribeAccessCode(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== KEY && event.key !== null) return;
    memoryAccessCode = event.newValue ?? undefined;
    onChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}
