import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/access-check/route";
import { accessCheckRateLimit } from "@/lib/server/rate-limits";

const ENV = { ...process.env };
let ipCounter = 100;
const freshIp = () => `10.99.9.${++ipCounter}`;

function req(ip: string, accessCode?: string): Request {
  const headers: Record<string, string> = { "x-forwarded-for": ip };
  if (accessCode !== undefined) headers["x-app-access-code"] = accessCode;
  return new Request("http://localhost/api/access-check", { method: "POST", headers });
}

describe("POST /api/access-check", () => {
  beforeEach(() => {
    process.env = { ...ENV, NODE_ENV: "test" };
    accessCheckRateLimit.reset();
  });
  afterEach(() => {
    process.env = { ...ENV };
  });

  it("accepts the correct code and rejects wrong ones without detail leaks", async () => {
    process.env.APP_ACCESS_CODE = "correct-code";
    const ok = await POST(req(freshIp(), "correct-code"));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Cache-Control")).toBe("no-store");
    expect(await ok.json()).toEqual({ ok: true });

    const wrong = await POST(req(freshIp(), "wrong-code"));
    expect(wrong.status).toBe(401);
    const body = (await wrong.json()) as Record<string, unknown>;
    expect(String(body.error)).not.toContain("correct-code");
    expect(body.code).toBe("invalid_code");

    const missing = await POST(req(freshIp()));
    expect(missing.status).toBe(401);
  });

  it("bypasses the gate in development when unconfigured, fails closed otherwise", async () => {
    delete process.env.APP_ACCESS_CODE;
    process.env = { ...process.env, NODE_ENV: "test" };
    const dev = await POST(req(freshIp()));
    expect(dev.status).toBe(200);
  });

  it("rate-limits burst attempts", async () => {
    process.env.APP_ACCESS_CODE = "correct-code";
    const ip = freshIp();
    let last = 200;
    for (let i = 0; i < 21; i++) {
      last = (await POST(req(ip, "nope"))).status;
    }
    expect(last).toBe(429);
  });
});
