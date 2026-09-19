// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/lib/server/history-db";
import { PUT as putAttempt, GET as getAttempt, DELETE as deleteAttempt } from "@/app/api/attempts/[id]/route";
import { PUT as putEvaluation } from "@/app/api/attempts/[id]/evaluation/route";
import { GET as listAttempts } from "@/app/api/attempts/route";
import { GET as getAudio } from "@/app/api/attempts/[id]/audio/route";

function makeWavBytes(durationMs = 1000): Buffer {
  const samples = Math.floor((16000 * durationMs) / 1000);
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(16000, 24);
  buf.writeUInt32LE(32000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples * 2, 40);
  return buf;
}

const ENV = { ...process.env };
const ID = "99999999-9999-4999-8999-999999999999";

function metadata() {
  return {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    durationMs: 1000,
    stopReason: "manual",
    referenceText: "She worked hard.",
    title: "Test",
    level: "B1.2",
    source: { kind: "custom", hash: "abc" },
    scope: "passage",
    locale: "en-US",
  };
}

function putReq(
  id: string,
  wav = makeWavBytes(),
  code = "secret",
  meta: Record<string, unknown> | null = null,
): Request {
  const form = new FormData();
  form.append("metadata", JSON.stringify(meta ?? metadata()));
  form.append("wav", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "recording.wav");
  return new Request(`http://localhost/api/attempts/${id}`, {
    method: "PUT",
    headers: { "x-app-access-code": code },
    body: form,
  });
}

describe("history API", () => {
  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "clearspeak-api-"));
    process.env = { ...ENV, CLEARSPEAK_DATA_DIR: dir, NODE_ENV: "test", APP_ACCESS_CODE: "secret" };
    closeDb();
  });
  afterEach(() => {
    closeDb();
    process.env = { ...ENV };
  });

  it("requires auth, creates, replays idempotently, and serves detail/audio", async () => {
    const anon = await putAttempt(putReq(ID, makeWavBytes(), ""), { params: Promise.resolve({ id: ID }) });
    expect(anon.status).toBe(401);
    // Identical replay must reuse byte-identical metadata (recordedAt is immutable).
    const meta = metadata();
    const created = await putAttempt(putReq(ID, makeWavBytes(), "secret", meta), { params: Promise.resolve({ id: ID }) });
    expect([200, 201]).toContain(created.status);
    const replay = await putAttempt(putReq(ID, makeWavBytes(), "secret", meta), { params: Promise.resolve({ id: ID }) });
    expect(replay.status).toBe(200);
    // Same ID with a fresh timestamp is a conflict, not a replay.
    const changed = await putAttempt(putReq(ID), { params: Promise.resolve({ id: ID }) });
    expect(changed.status).toBe(409);
    const authed = (code: string | null = "secret") =>
      new Request(`http://localhost/api/attempts/${ID}`, {
        headers: code === null ? {} : { "x-app-access-code": code },
      });
    expect((await getAttempt(authed(null), { params: Promise.resolve({ id: ID }) })).status).toBe(401);
    const detail = await getAttempt(authed(), { params: Promise.resolve({ id: ID }) });
    expect(detail.status).toBe(200);
    expect(detail.headers.get("Cache-Control")).toBe("no-store");
    const audio = await getAudio(authed(), { params: Promise.resolve({ id: ID }) });
    expect(audio.status).toBe(200);
    expect(audio.headers.get("Content-Type")).toBe("audio/wav");
    const list = await listAttempts(
      new Request("http://localhost/api/attempts", { headers: { "x-app-access-code": "secret" } }),
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
  });

  it("saves evaluations idempotently and deletes with tombstone 410 on stale upload", async () => {
    await putAttempt(putReq(ID), { params: Promise.resolve({ id: ID }) });
    const evalBody = {
      evaluationId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      expectedRevision: 0,
      evaluatedAt: new Date().toISOString(),
      assessmentConfig: {
        provider: "azure",
        sdkVersion: "1.51.0",
        locale: "en-US",
        enableProsody: false,
        phonemeAlphabet: "IPA",
        granularity: "phoneme",
        gradingSystem: "hundred-mark",
        miscue: true,
        parserVersion: 1,
      },
      result: {
        referenceText: "She worked hard.",
        recognizedText: "She worked hard.",
        pronunciationScore: 80,
        words: [],
        insertedWords: [],
      },
    };
    const save = (body: unknown) =>
      putEvaluation(
        new Request(`http://localhost/api/attempts/${ID}/evaluation`, {
          method: "PUT",
          headers: { "x-app-access-code": "secret", "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: ID }) },
      );
    expect((await save(evalBody)).status).toBe(200);
    expect((await save(evalBody)).status).toBe(200);
    // A result assessed against different text is rejected, not stored.
    const mismatched = await save({
      ...evalBody,
      evaluationId: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
      expectedRevision: 1,
      result: {
        referenceText: "Entirely different passage text.",
        recognizedText: "Entirely different passage text.",
        pronunciationScore: 80,
        words: [],
        insertedWords: [],
      },
    });
    expect(mismatched.status).toBe(400);
    const bad = await putEvaluation(
      new Request(`http://localhost/api/attempts/${ID}/evaluation`, {
        method: "PUT",
        headers: { "x-app-access-code": "secret", "Content-Type": "application/json" },
        body: "not-json",
      }),
      { params: Promise.resolve({ id: ID }) },
    );
    expect(bad.status).toBe(400);
    const del = await deleteAttempt(
      new Request(`http://localhost/api/attempts/${ID}`, {
        method: "DELETE",
        headers: { "x-app-access-code": "secret" },
      }),
      { params: Promise.resolve({ id: ID }) },
    );
    expect(del.status).toBe(200);
    const stale = await putAttempt(putReq(ID), { params: Promise.resolve({ id: ID }) });
    expect(stale.status).toBe(410);
  });

  it("rejects malformed and oversize audio", async () => {
    const badWav = await putAttempt(
      (() => {
        const form = new FormData();
        form.append("metadata", JSON.stringify(metadata()));
        form.append("wav", new Blob(["not-a-wav"], { type: "audio/wav" }), "recording.wav");
        return new Request(`http://localhost/api/attempts/${ID}`, {
          method: "PUT",
          headers: { "x-app-access-code": "secret" },
          body: form,
        });
      })(),
      { params: Promise.resolve({ id: ID }) },
    );
    expect(badWav.status).toBe(400);
    const big = Buffer.alloc(2 * 1024 * 1024 + 10, 1);
    const oversize = await putAttempt(
      (() => {
        const form = new FormData();
        form.append("metadata", JSON.stringify(metadata()));
        form.append("wav", new Blob([new Uint8Array(big)], { type: "audio/wav" }), "recording.wav");
        return new Request(`http://localhost/api/attempts/${ID}`, {
          method: "PUT",
          headers: { "x-app-access-code": "secret" },
          body: form,
        });
      })(),
      { params: Promise.resolve({ id: ID }) },
    );
    expect([400, 413]).toContain(oversize.status);
  });
});
