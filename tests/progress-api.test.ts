// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/lib/server/history-db";
import { GET as getProgress } from "@/app/api/progress/route";
import { DELETE as deleteFavourite, GET as listFavourites, PUT as putFavourite } from "@/app/api/favourites/route";
import { GET as exportHistory } from "@/app/api/attempts/export/route";
import { createAttempt, saveEvaluation } from "@/lib/server/history-repository";
import { validateWavBytes } from "@/lib/server/wav-validate";

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

function req(path: string, init?: RequestInit): Request {
  const headers = { "x-app-access-code": "secret", ...(init?.headers ?? {}) };
  return new Request(`http://localhost${path}`, { ...init, headers });
}

describe("progress API", () => {
  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "clearspeak-progress-api-"));
    process.env = { ...ENV, CLEARSPEAK_DATA_DIR: dir, NODE_ENV: "test", APP_ACCESS_CODE: "secret" };
    closeDb();
  });
  afterEach(() => {
    closeDb();
    process.env = { ...ENV };
  });

  it("requires auth on progress, favourites, and export", async () => {
    const anon = { headers: {} };
    expect((await getProgress(new Request("http://localhost/api/progress", anon))).status).toBe(401);
    expect((await listFavourites(new Request("http://localhost/api/favourites", anon))).status).toBe(401);
    expect((await exportHistory(new Request("http://localhost/api/attempts/export", anon))).status).toBe(401);
  });

  it("rejects unknown passages as favourites", async () => {
    const res = await putFavourite(
      req("/api/favourites", {
        method: "PUT",
        body: JSON.stringify({ passageId: "nope", passageVersion: 1 }),
      }),
    );
    expect(res.status).toBe(404);
    const bad = await putFavourite(
      req("/api/favourites", { method: "PUT", body: JSON.stringify({ passageId: "", passageVersion: -1 }) }),
    );
    expect(bad.status).toBe(400);
  });

  it("adds, lists, and removes favourites by resolved library identity", async () => {
    const passages = (await import("@/lib/practice-content")).PRACTICE_PASSAGES;
    const first = passages[0];
    const put = await putFavourite(
      req("/api/favourites", {
        method: "PUT",
        body: JSON.stringify({ passageId: first.id, passageVersion: first.version }),
      }),
    );
    expect(put.status).toBe(200);
    const listed = await listFavourites(req("/api/favourites"));
    const items = ((await listed.json()) as { items: Array<{ targetKey: string }> }).items;
    expect(items).toHaveLength(1);
    const missing = await deleteFavourite(req("/api/favourites?target=library:nope:1", { method: "DELETE" }));
    expect(missing.status).toBe(404);
    const removed = await deleteFavourite(req(`/api/favourites?target=${items[0].targetKey}`, { method: "DELETE" }));
    expect(removed.status).toBe(200);
    const relisted = (await (await listFavourites(req("/api/favourites"))).json()) as { items: unknown[] };
    expect(relisted.items).toEqual([]);
  });

  it("reports due reviews, weekly counts, and stats after an old evaluation", async () => {
    const wav = validateWavBytes(makeWavBytes());
    const id = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    createAttempt({
      id,
      schemaVersion: 1,
      recordedAt: "2026-09-10T10:00:00.000Z",
      durationMs: 1000,
      stopReason: "manual",
      referenceText: "She worked hard.",
      title: "Old take",
      level: "B1.2",
      source: { kind: "custom", hash: "oldie" },
      scope: "passage",
      locale: "en-US",
      wav,
    });
    saveEvaluation(id, {
      evaluationId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      expectedRevision: 0,
      evaluatedAt: "2026-09-10T10:05:00.000Z",
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
        pronunciationScore: 72,
        words: [],
        insertedWords: [],
      },
    });

    const recentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    createAttempt({
      id: recentId,
      schemaVersion: 1,
      recordedAt: "2099-09-10T10:00:00.000Z",
      durationMs: 1000,
      stopReason: "manual",
      referenceText: "She worked hard.",
      title: "Future take",
      level: "B1.2",
      source: { kind: "custom", hash: "recent" },
      scope: "passage",
      locale: "en-US",
      wav,
    });
    saveEvaluation(recentId, {
      evaluationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      expectedRevision: 0,
      evaluatedAt: "2099-09-10T10:05:00.000Z",
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
        pronunciationScore: 82,
        words: [],
        insertedWords: [],
      },
    });

    const res = await getProgress(req("/api/progress"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totals: { attempts: number; practiceDays: number };
      due: Array<{ targetKey: string; lastScore: number }>;
      weekly: Array<{ date: string; attempts: number }>;
      favourites: unknown[];
      stats: Array<{ targetKey: string; attempts: number }>;
    };
    expect(body.totals).toMatchObject({ attempts: 2, practiceDays: 2 });
    expect(body.due).toHaveLength(1);
    expect(body.due[0]).toMatchObject({ targetKey: "custom:oldie", lastScore: 72 });
    expect(body.weekly).toHaveLength(7);
    expect(body.stats).toHaveLength(2);
    expect(body.stats).toEqual(expect.arrayContaining([expect.objectContaining({ targetKey: "custom:recent" })]));

    const exported = await exportHistory(req("/api/attempts/export"));
    expect(exported.status).toBe(200);
    expect(exported.headers.get("Content-Disposition")).toContain("attachment");
    const payload = (await exported.json()) as { version: number; attempts: unknown[]; review: unknown[] };
    expect(payload.version).toBe(1);
    expect(payload.attempts).toHaveLength(2);
    expect(payload.review).toHaveLength(2);
  });
});
