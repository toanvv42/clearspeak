"use client";

const KEY = "clearspeak-access";

/**
 * Personal access code storage. Long-lived on purpose: one unlock lasts
 * across tabs and browser restarts on this device. The code is still only
 * ever sent as the `x-app-access-code` header — never in URLs or logs.
 * A 401 from any API call clears it and shows the gate again.
 */
export function getAccessCode(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    // Fall back to a pre-existing session copy from before the migration.
    return localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function hasAccessCode(): boolean {
  return getAccessCode() != null;
}

export function setAccessCode(code: string): void {
  try {
    localStorage.setItem(KEY, code);
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage may be blocked */
  }
}

export function clearAccessCode(): void {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
