import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/lib/server/history-db";
import {
  addFavourite,
  createAttempt,
  exportHistory,
  getDueReviews,
  getTargetStats,
  getWeeklyCounts,
  listFavourites,
  removeFavourite,
  saveEvaluation,
} from "@/lib/server/history-repository";
import { validateWavBytes } from "@/lib/server/wav-validate";
import { reviewTargetKey } from "@/lib/review-schedule";

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
let dir = "";
let wav: ReturnType<typeof validateWavBytes>;

function meta(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    recordedAt: "2026-09-19T10:00:00.000Z",
    durationMs: 1000,
    stopReason: "manual" as const,
    referenceText: "She worked hard.",
    title: "Work update",
    level: "B1.2",
    source: { kind: "custom" as const, hash: "abc" },
    scope: "passage" as const,
    locale: "en-US",
    ...overrides,
  };
}

function evalPayload(evalId: string, evaluatedAt: string, score: number | undefined = 80) {
  return {
    evaluationId: evalId,
    expectedRevision: 0,
    evaluatedAt,
    assessmentConfig: {
      provider: "azure" as const,
      sdkVersion: "1.51.0",
      locale: "en-US",
      enableProsody: false,
      phonemeAlphabet: "IPA" as const,
      granularity: "phoneme" as const,
      gradingSystem: "hundred-mark" as const,
      miscue: true,
      parserVersion: 1,
    },
    result: {
      referenceText: "She worked hard.",
      recognizedText: "She worked hard.",
      pronunciationScore: score,
      words: [],
      insertedWords: [],
    },
  };
}

describe("progress repository", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "clearspeak-progress-"));
    process.env = { ...ENV, CLEARSPEAK_DATA_DIR: dir, NODE_ENV: "test" };
    closeDb();
    wav = validateWavBytes(makeWavBytes());
  });
  afterEach(() => {
    closeDb();
    process.env = { ...ENV };
  });

  it("upgrades a v1 database without losing attempts", () => {
    // Hand-build a migration-1 database: attempts table only.
    const legacy = new DatabaseSync(join(dir, "clearspeak.sqlite"));
    legacy.exec(
      `CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
       CREATE TABLE attempts (
         id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, recorded_at TEXT NOT NULL,
         created_at TEXT NOT NULL, duration_ms INTEGER NOT NULL, stop_reason TEXT NOT NULL,
         reference_text TEXT NOT NULL, title TEXT, level TEXT, source_kind TEXT NOT NULL,
         source_id TEXT, source_version INTEGER, source_hash TEXT, scope TEXT NOT NULL DEFAULT 'passage',
         locale TEXT NOT NULL DEFAULT 'en-US', evaluation_state TEXT NOT NULL DEFAULT 'pending',
         revision INTEGER NOT NULL DEFAULT 0, evaluation_id TEXT, evaluated_at TEXT,
         assessment_config_json TEXT, evaluation_json TEXT, failure_kind TEXT, failure_message TEXT,
         pronunciation_score REAL, accuracy_score REAL, fluency_score REAL, completeness_score REAL,
         prosody_score REAL, evaluation_schema_version INTEGER);
       CREATE TABLE audio (attempt_id TEXT PRIMARY KEY, wav BLOB NOT NULL, byte_length INTEGER NOT NULL,
         sha256 TEXT NOT NULL, channels INTEGER NOT NULL, sample_rate INTEGER NOT NULL, bits INTEGER NOT NULL);
       CREATE TABLE tombstones (id TEXT PRIMARY KEY, deleted_at TEXT NOT NULL);
       INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-09-01T00:00:00.000Z');
       INSERT INTO attempts (id, schema_version, recorded_at, created_at, duration_ms, stop_reason, reference_text, title, level, source_kind, source_hash, scope, locale, evaluation_state, revision)
         VALUES ('11111111-1111-4111-8111-111111111111', 1, '2026-09-10T10:00:00.000Z', '2026-09-10T10:00:01.000Z', 1000, 'manual', 'She worked hard.', 'Legacy', 'B1.2', 'custom', 'abc', 'passage', 'en-US', 'pending', 0);`,
    );
    legacy.close();

    // Opening through the app must apply migration 2 and keep the old row.
    getDb();
    expect(listFavourites()).toEqual([]);
    expect(getDueReviews("2026-09-20T00:00:00.000Z")).toEqual([]);
    const id = "22222222-2222-4222-8222-222222222222";
    expect(createAttempt({ id, ...meta(), wav }).created).toBe(true);
    expect(addFavourite("b12-01", 1, "Work update").targetKey).toBe("library:b12-01:1");
  });

  it("records review practice and advances the schedule idempotently", () => {
    const id = "33333333-3333-4333-8333-333333333333";
    createAttempt({ id, ...meta(), wav });
    saveEvaluation(id, evalPayload("aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", "2026-09-19T10:00:00.000Z", 70));

    // Next due is tomorrow: not due today, due the day after.
    expect(getDueReviews("2026-09-19T12:00:00.000Z")).toEqual([]);
    const due = getDueReviews("2026-09-21T00:00:00.000Z");
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      targetKey: "custom:abc",
      title: "Work update",
      intervalStep: 0,
      practiceCount: 1,
      lastScore: 70,
    });

    // Idempotent replay of the same evaluation never double-advances.
    saveEvaluation(id, evalPayload("aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", "2026-09-19T10:00:00.000Z", 70));
    expect(getDueReviews("2026-09-21T00:00:00.000Z")[0]).toMatchObject({
      intervalStep: 0,
      practiceCount: 1,
    });

    // A newer take advances to the 3-day interval with count 2.
    const id2 = "44444444-4444-4444-8444-444444444444";
    createAttempt({ id: id2, ...meta({ recordedAt: "2026-09-20T10:00:00.000Z" }), wav });
    saveEvaluation(
      id2,
      { ...evalPayload("bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb", "2026-09-20T10:00:00.000Z", 85), expectedRevision: 0 },
    );
    const advanced = getDueReviews("2026-09-24T00:00:00.000Z");
    expect(advanced[0]).toMatchObject({ intervalStep: 1, practiceCount: 2, lastScore: 85 });
    expect(advanced[0].nextDueAt).toBe("2026-09-23T10:00:00.000Z");
  });

  it("reports first, latest, and best for one target", () => {
    const ids = [
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
      "77777777-7777-4777-8777-777777777777",
    ];
    const scores = [70, 90, 80];
    const days = ["2026-09-10", "2026-09-11", "2026-09-12"];
    ids.forEach((id, i) => {
      createAttempt({ id, ...meta({ recordedAt: `${days[i]}T10:00:00.000Z` }), wav });
      saveEvaluation(
        id,
        {
          ...evalPayload(`aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa${i}`, `${days[i]}T11:00:00.000Z`, scores[i]),
          expectedRevision: 0,
        },
      );
    });
    const stats = getTargetStats("custom:abc");
    expect(stats.attempts).toBe(3);
    expect(stats.first).toMatchObject({ score: 70 });
    expect(stats.latest).toMatchObject({ score: 80 });
    expect(stats.best).toMatchObject({ score: 90 });
    expect(getTargetStats("custom:missing")).toMatchObject({ attempts: 0, first: null });
  });

  it("counts takes per day and manages favourites", () => {
    createAttempt({ id: "88888888-8888-4888-8888-888888888888", ...meta(), wav });
    const weekly = getWeeklyCounts(7);
    expect(weekly).toHaveLength(7);
    expect(weekly.reduce((sum, d) => sum + d.attempts, 0)).toBe(1);

    expect(listFavourites()).toEqual([]);
    const fav = addFavourite("b12-01", 1, "Work update");
    expect(fav.targetKey).toBe(reviewTargetKey({ kind: "library", id: "b12-01", version: 1 }));
    expect(listFavourites()).toHaveLength(1);
    expect(removeFavourite(fav.targetKey)).toBe(true);
    expect(removeFavourite(fav.targetKey)).toBe(false);
    expect(listFavourites()).toEqual([]);
  });

  it("exports compact summaries without audio bytes", () => {
    const id = "99999999-9999-4999-8999-999999999999";
    createAttempt({ id, ...meta(), wav });
    saveEvaluation(id, evalPayload("aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", "2026-09-19T10:00:00.000Z"));
    addFavourite("b12-01", 1, "Work update");
    const data = exportHistory();
    expect(data.version).toBe(1);
    expect(data.attempts).toHaveLength(1);
    expect(data.review).toHaveLength(1);
    expect(data.favourites).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain("BLOB");
    expect(JSON.stringify(data)).not.toContain("RIFF");
  });
});
