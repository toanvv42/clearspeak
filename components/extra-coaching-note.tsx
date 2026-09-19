"use client";

import {
  buildExtraCoachingNote,
  isExtraCoachingPilotEnabled,
  type ExtraCoachingNote,
} from "@/lib/extra-coaching";
import type { AssessmentResult } from "@/lib/types";

function resolveNote(result: AssessmentResult): ExtraCoachingNote | null {
  // Pilot gate (disabled by default) + fail open: anything unexpected
  // returns null so the standard results always render.
  try {
    if (!isExtraCoachingPilotEnabled()) return null;
    return buildExtraCoachingNote(result);
  } catch {
    return null;
  }
}

export default function ExtraCoachingNote({ result }: { result: AssessmentResult }) {
  const note = resolveNote(result);
  if (!note) return null;
  return (
    <div
      role="note"
      aria-label="Pilot coaching note"
      className="rounded-3xl border border-dashed border-[#2563eb]/40 bg-blue-50/60 p-5 sm:p-6 dark:bg-blue-950/30"
    >
      <p className="inline-block rounded-full bg-[#2563eb] px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-white">
        Pilot
      </p>
      <h3 className="mt-2 text-[15px] font-extrabold tracking-tight">Extra coaching note</h3>
      <p className="mt-1.5 text-sm leading-6 font-medium">{note.observation}</p>
      <p className="mt-1.5 text-sm leading-6">{note.exercise}</p>
      <p className="mt-2 text-xs opacity-60">
        Derived from your Azure scores and a reviewed tip ({note.tipTitle}) — not an AI diagnosis.
      </p>
    </div>
  );
}
