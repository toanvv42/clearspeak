"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AppHeader() {
  const pathname = usePathname();
  const onHistory = pathname === "/history" || pathname?.startsWith("/history/");
  const onProgress = pathname === "/progress" || pathname?.startsWith("/progress");
  return (
    <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-[#f8f7f4]/85 backdrop-blur-md dark:border-white/10 dark:bg-stone-950/80">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-stone-900 text-white dark:bg-white dark:text-stone-900"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="6" y="1.5" width="4" height="8" rx="2" fill="currentColor" />
            <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <line x1="8" y1="12" x2="8" y2="14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <p className="text-[17px] font-extrabold tracking-tight">ClearSpeak</p>
        <nav aria-label="Primary" className="ml-2 flex items-center gap-1">
          <Link
            href="/"
            aria-current={onHistory || onProgress ? undefined : "page"}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
              onHistory || onProgress
                ? "text-stone-600 hover:bg-stone-200/60 dark:text-stone-300"
                : "bg-stone-900 text-white dark:bg-white dark:text-stone-900"
            }`}
          >
            Practice
          </Link>
          <Link
            href="/progress"
            aria-current={onProgress ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
              onProgress
                ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900"
                : "text-stone-600 hover:bg-stone-200/60 dark:text-stone-300"
            }`}
          >
            Progress
          </Link>
          <Link
            href="/history"
            aria-current={onHistory ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
              onHistory
                ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900"
                : "text-stone-600 hover:bg-stone-200/60 dark:text-stone-300"
            }`}
          >
            History
          </Link>
        </nav>
        <span className="ml-auto hidden items-center gap-1.5 text-xs text-stone-500 sm:flex dark:text-stone-400">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
          Practice, listen, improve.
        </span>
      </div>
    </header>
  );
}
