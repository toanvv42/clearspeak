function createRateLimit(windowMs: number, maxRequests: number) {
  const hits = new Map<string, number[]>();
  return {
    exceeded(key: string) {
      const now = Date.now();
      const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
      recent.push(now);
      hits.set(key, recent);
      return recent.length > maxRequests;
    },
    reset() {
      hits.clear();
    },
  };
}

export const accessCheckRateLimit = createRateLimit(60_000, 20);
export const speechTokenRateLimit = createRateLimit(60_000, 10);
