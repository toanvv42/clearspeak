import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetRateLimitForTests, POST } from "@/app/api/speech-token/route";

const ENV = { ...process.env };
let ipCounter = 0;
const freshIp = () => `10.99.0.${++ipCounter}`;

function req(ip: string, accessCode?: string): Request {
  const headers: Record<string, string> = { "x-forwarded-for": ip };
  if (accessCode !== undefined) headers["x-app-access-code"] = accessCode;
  return new Request("http://localhost/api/speech-token", { method: "POST", headers });
}

function mockTokenFetch(status: number, body = "fake-token") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      status === 200
        ? new Response(body, { status })
        : new Response("azure-error-body-with-secrets", { status }),
    ),
  );
}

describe("POST /api/speech-token", () => {
  beforeEach(() => {
    process.env = { ...ENV, NODE_ENV: "test" };
    __resetRateLimitForTests();
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    process.env = { ...ENV };
    vi.unstubAllGlobals();
  });

  it("returns a token with no-store headers on success", async () => {
    process.env.AZURE_SPEECH_KEY = "key";
    process.env.AZURE_SPEECH_REGION = "southeastasia";
    delete process.env.APP_ACCESS_CODE;
    mockTokenFetch(200);
    const res = await POST(req(freshIp()));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.token).toBe("fake-token");
    expect(body.region).toBe("southeastasia");
    expect(body.enableProsody).toBe(false);
    const expires = new Date(body.expiresAt as string).getTime();
    const delta = expires - Date.now();
    expect(delta).toBeGreaterThan(8 * 60 * 1000);
    expect(delta).toBeLessThanOrEqual(9 * 60 * 1000 + 5000);
  });

  it("fails with 500 when server env is missing", async () => {
    delete process.env.AZURE_SPEECH_KEY;
    delete process.env.APP_ACCESS_CODE;
    const res = await POST(req(freshIp()));
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects wrong access codes with a generic 401", async () => {
    process.env.AZURE_SPEECH_KEY = "key";
    process.env.AZURE_SPEECH_REGION = "southeastasia";
    process.env.APP_ACCESS_CODE = "correct-code";
    mockTokenFetch(200);
    const missing = await POST(req(freshIp()));
    expect(missing.status).toBe(401);
    const wrong = await POST(req(freshIp(), "wrong-code"));
    expect(wrong.status).toBe(401);
    const body = (await wrong.json()) as Record<string, unknown>;
    expect(String(body.error)).not.toContain("correct-code");
    expect(String(body.error)).not.toMatch(/which part|too short|too long/i);
    const ok = await POST(req(freshIp(), "correct-code"));
    expect(ok.status).toBe(200);
  });

  it("never echoes Azure raw errors and maps 401/429", async () => {
    process.env.AZURE_SPEECH_KEY = "key";
    process.env.AZURE_SPEECH_REGION = "southeastasia";
    delete process.env.APP_ACCESS_CODE;
    mockTokenFetch(401);
    const bad = await POST(req(freshIp()));
    expect(bad.status).toBe(502);
    expect(JSON.stringify(await bad.json())).not.toContain("azure-error-body-with-secrets");
    mockTokenFetch(429);
    const throttled = await POST(req(freshIp()));
    expect(throttled.status).toBe(429);
  });

  it("rate-limits burst traffic per IP", async () => {
    process.env.AZURE_SPEECH_KEY = "key";
    process.env.AZURE_SPEECH_REGION = "southeastasia";
    delete process.env.APP_ACCESS_CODE;
    mockTokenFetch(200);
    const ip = freshIp();
    let lastStatus = 200;
    for (let i = 0; i < 11; i++) {
      const res = await POST(req(ip));
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
