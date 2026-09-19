"use client";

import { useState } from "react";

export default function AccessGate({ onUnlock }: { onUnlock: (code: string) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Enter your access code.");
      return;
    }
    setError(null);
    setChecking(true);
    try {
      const res = await fetch("/api/access-check", {
        method: "POST",
        headers: { "x-app-access-code": trimmed },
      });
      if (res.ok) {
        try {
          sessionStorage.setItem("clearspeak-access", trimmed);
        } catch {
          /* ignore */
        }
        onUnlock(trimmed);
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "That access code wasn't recognized. Check it and try again.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center px-4 py-16">
      <div className="w-full rounded-3xl border border-stone-200 bg-white p-8 shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.04]">
        <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-900 text-white dark:bg-white dark:text-stone-900">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="6" y="1.5" width="4" height="8" rx="2" fill="currentColor" />
            <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <line x1="8" y1="12" x2="8" y2="14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-[#2563eb]">Clearspeak</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>This practice space is private</h1>
        <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">
          Enter your personal access code to unlock pronunciation practice.
        </p>
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(code);
          }}
        >
          <label htmlFor="access-code" className="text-sm font-bold">
            Access code
          </label>
          <input
            id="access-code"
            type="password"
            autoComplete="off"
            value={code}
            disabled={checking}
            onChange={(e) => setCode(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-base shadow-[inset_0_1px_2px_rgb(0_0_0/0.04)] outline-none transition placeholder:text-stone-400 focus:border-[#2563eb] focus:ring-4 focus:ring-[#2563eb]/15 disabled:opacity-60 dark:border-white/15 dark:bg-black/30"
            placeholder="Your personal code"
          />
          {error && (
            <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={checking}
            className="mt-4 w-full rounded-2xl bg-stone-900 px-4 py-3 text-[15px] font-bold text-white transition hover:bg-stone-700 active:scale-[0.99] disabled:opacity-60 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"
          >
            {checking ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
