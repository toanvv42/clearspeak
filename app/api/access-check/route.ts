import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { accessCheckRateLimit } from "@/lib/server/rate-limits";

export const runtime = "nodejs";

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function timingSafeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/**
 * Lightweight access-code validation so the client learns a code is wrong
 * before the user records. Comparison stays server-side; the response never
 * reveals configuration or Azure details.
 */
export async function POST(req: Request) {
  const res = (body: unknown, status: number) => {
    const r = NextResponse.json(body, { status });
    r.headers.set("Cache-Control", "no-store");
    return r;
  };

  const ip = clientIp(req);
  if (accessCheckRateLimit.exceeded(ip)) {
    return res(
      { error: "Too many attempts. Wait a moment and try again.", code: "rate_limited" },
      429,
    );
  }

  const isDev = process.env.NODE_ENV !== "production";
  const accessCode = process.env.APP_ACCESS_CODE ?? "";
  if (!accessCode) {
    // No gate configured: development bypasses it, production fails closed.
    if (isDev) return res({ ok: true, gateDisabled: true }, 200);
    return res({ error: "Service is not configured.", code: "not_configured" }, 500);
  }

  const provided = req.headers.get("x-app-access-code") ?? "";
  if (provided && timingSafeCompare(provided, accessCode)) {
    return res({ ok: true }, 200);
  }
  return res(
    { error: "That access code wasn't recognized. Check it and try again.", code: "invalid_code" },
    401,
  );
}
