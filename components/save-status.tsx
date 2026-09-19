"use client";

import type { SaveState } from "@/hooks/use-attempt-save";
import { saveStatusCopy } from "@/hooks/use-attempt-save";

export default function SaveStatus({
  state,
  onRetry,
  onDownload,
}: {
  state: SaveState;
  onRetry?: () => void;
  onDownload?: () => void;
}) {
  const copy = saveStatusCopy(state);
  if (!copy) return null;
  const tone =
    state.kind === "saved"
      ? "border-emerald-700/20 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
      : state.kind === "unsaved"
        ? "border-red-700/20 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"
        : "border-stone-300 bg-stone-100 text-stone-700 dark:border-white/15 dark:bg-white/5 dark:text-stone-300";
  return (
    <p
      role="status"
      aria-live="polite"
      className={`inline-flex flex-wrap items-center gap-2 rounded-full border px-3 py-1 text-[13px] font-semibold ${tone}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {copy}
      {((state.kind === "unsaved" && state.canRetry) || state.kind === "feedback-waiting") && onRetry && (
        <button type="button" onClick={onRetry} className="underline underline-offset-2">
          Retry save
        </button>
      )}
      {state.kind === "unsaved" && onDownload && (
        <button type="button" onClick={onDownload} className="underline underline-offset-2">
          Download recording
        </button>
      )}
    </p>
  );
}
