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
      <div className="w-full rounded-2xl border border-[#e5ddcb] bg-white p-8 shadow-sm dark:border-white/10 dark:bg-white/5">
        <p className="text-sm font-semibold tracking-wide text-[#2563eb]">CLEARSPEAK</p>
        <h1 className="mt-2 text-2xl font-bold">This practice space is private</h1>
        <p className="mt-2 text-sm leading-6 opacity-80">
          Enter your personal access code to unlock pronunciation practice.
        </p>
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(code);
          }}
        >
          <label htmlFor="access-code" className="text-sm font-medium">
            Access code
          </label>
          <input
            id="access-code"
            type="password"
            autoComplete="off"
            value={code}
            disabled={checking}
            onChange={(e) => setCode(e.target.value)}
            className="mt-2 w-full rounded-xl border border-[#d8cfb8] bg-white px-4 py-3 text-base outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/30 disabled:opacity-60 dark:border-white/15 dark:bg-black/30"
            placeholder="Your personal code"
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={checking}
            className="mt-4 w-full rounded-xl bg-[#2563eb] px-4 py-3 text-base font-semibold text-white hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
          >
            {checking ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
