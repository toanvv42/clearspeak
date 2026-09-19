"use client";

import { useSyncExternalStore } from "react";
import { getAccessCode, subscribeAccessCode } from "@/lib/access-code";

const getServerAccessCode = () => undefined;

/**
 * Returns the stored access code without changing the server/client hydration snapshot.
 * React reads browser storage only after hydration, then updates subscribed consumers.
 */
export function useStoredAccessCode(): string | undefined {
  return useSyncExternalStore(subscribeAccessCode, getAccessCode, getServerAccessCode);
}
