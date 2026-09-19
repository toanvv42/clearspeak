import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

const hits = new Map<string, number[]>();

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > MAX_REQUESTS;
}

/** Best-effort per-IP limiter for a personal MVP (not a durable distributed limiter). */
export function __resetRateLimitForTests() {
  hits.clear();
}

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  return res;
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

const REGION_RE = /^[a-z0-9-]+$/;

export async function POST(req: Request) {
  const isDev = process.env.NODE_ENV !== "production";
  const accessCode = process.env.APP_ACCESS_CODE ?? "";
  const speechKey = process.env.AZURE_SPEECH_KEY ?? "";
  const speechRegion = process.env.AZURE_SPEECH_REGION ?? "";
  const enableProsody = process.env.AZURE_ENABLE_PROSODY === "true";

  if (rateLimited(clientIp(req))) {
    return noStore(
      NextResponse.json(
        { error: "Too many requests. Please wait a moment and try again.", code: "rate_limited" },
        { status: 429 },
      ),
    );
  }

  // Personal-app access gate. Production fails closed when unconfigured.
  if (accessCode) {
    const provided = req.headers.get("x-app-access-code") ?? "";
    if (!provided || !timingSafeCompare(provided, accessCode)) {
      return noStore(
        NextResponse.json(
          { error: "Unauthorized.", code: "unauthorized" },
          { status: 401 },
        ),
      );
    }
  } else if (!isDev) {
    return noStore(
      NextResponse.json(
        { error: "Service is not configured.", code: "not_configured" },
        { status: 500 },
      ),
    );
  }

  if (!speechKey || !speechRegion) {
    return noStore(
      NextResponse.json(
        { error: "Speech service is not configured on the server.", code: "not_configured" },
        { status: 500 },
      ),
    );
  }
  if (!REGION_RE.test(speechRegion)) {
    return noStore(
      NextResponse.json(
        { error: "Speech service region is misconfigured.", code: "bad_region" },
        { status: 500 },
      ),
    );
  }

  let token: string;
  try {
    const res = await fetch(`https://${speechRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": speechKey,
        "Content-Length": "0",
      },
      body: "",
    });
    if (res.status === 401 || res.status === 403) {
      return noStore(
        NextResponse.json(
          { error: "Speech credentials were rejected. Check the key and region.", code: "bad_credentials" },
          { status: 502 },
        ),
      );
    }
    if (res.status === 429) {
      return noStore(
        NextResponse.json(
          {
            error: "Speech service is busy. The free tier allows one request at a time.",
            code: "throttled",
          },
          { status: 429 },
        ),
      );
    }
    if (!res.ok) {
      return noStore(
        NextResponse.json(
          { error: "Could not reach the speech service. Try again shortly.", code: "token_failed" },
          { status: 502 },
        ),
      );
    }
    token = await res.text();
  } catch {
    return noStore(
      NextResponse.json(
        { error: "Could not reach the speech service. Try again shortly.", code: "token_failed" },
        { status: 502 },
      ),
    );
  }

  if (!token) {
    return noStore(
      NextResponse.json(
        { error: "Could not reach the speech service. Try again shortly.", code: "token_failed" },
        { status: 502 },
      ),
    );
  }

  // Tokens are valid ~10 minutes; expire slightly early so the client never uses a stale one.
  const expiresAt = new Date(Date.now() + 9 * 60 * 1000).toISOString();
  return noStore(
    NextResponse.json({ token, region: speechRegion, expiresAt, enableProsody }),
  );
}
