import { timingSafeEqual } from "node:crypto";

export function timingSafeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

export function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function configuredAccessCode(): string {
  return process.env.APP_ACCESS_CODE ?? "";
}

/** Shared access-code gate for history + token routes. Returns null when authorized. */
export function checkAccess(req: Request): { status: number; body: unknown } | null {
  const accessCode = configuredAccessCode();
  if (accessCode) {
    const provided = req.headers.get("x-app-access-code") ?? "";
    if (!provided || !timingSafeCompare(provided, accessCode)) {
      return { status: 401, body: { error: "Unauthorized.", code: "unauthorized" } };
    }
    return null;
  }
  if (!isDev()) {
    return { status: 500, body: { error: "Service is not configured.", code: "not_configured" } };
  }
  return null;
}
