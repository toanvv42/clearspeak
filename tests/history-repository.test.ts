import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, snapshotDatabase } from "@/lib/server/history-db";
import {
  createAttempt,
  deleteAttempt,
  getAttemptAudio,
  getAttemptDetail,
  listAttempts,
  saveEvaluation,
} from "@/lib/server/history-repository";
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
let dir = "";

function meta(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    recordedAt: "2026-09-19T10:00:00.000Z",
    durationMs: 1000,
    stopReason: "manual" as const,
    referenceText: "She worked hard.",
    title: "Test",
    level: "B1.2",
    source: { kind: "custom" as const, hash: "abc" },
    scope: "passage" as const,
    locale: "en-US",
    ...overrides,
  };
}

describe("history repository", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "clearspeak-test-"));
    process.env = { ...ENV, CLEARSPEAK_DATA_DIR: dir, NODE_ENV: "test" };
    closeDb();
  });
  afterEach(() => {
    closeDb();
    process.env = { ...ENV };
  });

  it("creates, reopens, and lists attempts without reading audio blobs", async () => {
    const wav = validateWavBytes(makeWavBytes());
    const id = "11111111-1111-4111-8111-111111111111";
    const { created } = createAttempt({ id, ...meta(), wav });
    expect(created).toBe(true);
    const detail = getAttemptDetail(id);
    expect(detail?.referenceText).toBe("She worked hard.");
    expect(detail?.evaluationState).toBe("pending");
    const audio = getAttemptAudio(id);
    expect(audio?.byteLength).toBeGreaterThan(1000);
    // Reopen behaves: close singleton and read again from the same dir.
    closeDb();
    const again = getAttemptDetail(id);
    expect(again?.id).toBe(id);
    const list = listAttempts({});
    expect(list.items).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain("BLOB");
  });

  it("is idempotent for identical retries and conflicts on changed payloads", () => {
    const wav = validateWavBytes(makeWavBytes());
    const id = "22222222-2222-4222-8222-222222222222";
    createAttempt({ id, ...meta(), wav });
    const replay = createAttempt({ id, ...meta(), wav });
    expect(replay.created).toBe(false);
    expect(() =>
      createAttempt({ id, ...meta({ referenceText: "Different text" }), wav }),
    ).toThrowError("conflict");
    // Same audio but changed immutable metadata is a conflict, not a replay.
    expect(() => createAttempt({ id, ...meta({ title: "Renamed" }), wav })).toThrowError("conflict");
    expect(() =>
      createAttempt({ id, ...meta({ stopReason: "limit" as const }), wav }),
    ).toThrowError("conflict");
    expect(() =>
      createAttempt({
        id,
        ...meta({ source: { kind: "library" as const, id: "a1-01", version: 1 } }),
        wav,
      }),
    ).toThrowError("conflict");
  });

  it("saves evaluations idempotently and blocks stale revisions and failure-over-success", () => {
    const wav = validateWavBytes(makeWavBytes());
    const id = "33333333-3333-4333-8333-333333333333";
    createAttempt({ id, ...meta(), wav });
    const evalId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    const payload = {
      evaluationId: evalId,
      expectedRevision: 0,
      evaluatedAt: new Date().toISOString(),
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
        pronunciationScore: 80,
        words: [],
        insertedWords: [],
      },
    };
    const saved = saveEvaluation(id, payload);
    expect(saved.evaluationState).toBe("success");
    expect(saved.revision).toBe(1);
    const replay = saveEvaluation(id, payload);
    expect(replay.revision).toBe(1);
    // Same evaluation id replays idempotently even with a stale expected revision.
    expect(saveEvaluation(id, { ...payload, expectedRevision: 0 }).revision).toBe(1);
    // A different evaluation id with a stale revision conflicts.
    expect(() =>
      saveEvaluation(id, {
        ...payload,
        evaluationId: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
        expectedRevision: 0,
      }),
    ).toThrowError("conflict");
    expect(() =>
      saveEvaluation(id, {
        ...payload,
        evaluationId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
        expectedRevision: 1,
        result: undefined,
        failure: { kind: "network", message: "late failure" },
      }),
    ).toThrowError("conflict");
  });

  it("rejects evaluations assessed against different text", () => {
    const wav = validateWavBytes(makeWavBytes());
    const id = "99999999-0000-4000-8000-000000000000";
    createAttempt({ id, ...meta(), wav });
    expect(() =>
      saveEvaluation(id, {
        evaluationId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
        expectedRevision: 0,
        evaluatedAt: new Date().toISOString(),
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
          referenceText: "Entirely different passage text.",
          recognizedText: "Entirely different passage text.",
          pronunciationScore: 80,
          words: [],
          insertedWords: [],
        },
      }),
    ).toThrowError("reference-mismatch");
  });

  it("finds a matching previous take beyond many unrelated attempts", () => {
    const wav = validateWavBytes(makeWavBytes());
    const oldId = "aaaaaaaa-0000-4000-8000-000000000001";
    createAttempt({
      id: oldId,
      ...meta({ recordedAt: "2026-01-01T10:00:00.000Z" }),
      wav,
    });
    saveEvaluation(oldId, {
      evaluationId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaa0001",
      expectedRevision: 0,
      evaluatedAt: "2026-01-01T10:01:00.000Z",
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
        pronunciationScore: 70,
        words: [],
        insertedWords: [],
      },
    });
    // 45 newer unrelated takes must not hide the old compatible one.
    for (let i = 0; i < 45; i += 1) {
      const uid = `bbbbbbbb-bbbb-4000-8000-${String(i).padStart(12, "0")}`;
      createAttempt({
        id: uid,
        ...meta({
          recordedAt: `2026-02-${String((i % 27) + 1).padStart(2, "0")}T10:00:00.000Z`,
          referenceText: `Unrelated passage number ${i} for padding.`,
        }),
        wav,
      });
    }
    const curId = "cccccccc-cccc-4000-8000-00000000000c";
    createAttempt({ id: curId, ...meta({ recordedAt: "2026-09-19T10:00:00.000Z" }), wav });
    const detail = getAttemptDetail(curId);
    expect(detail?.previousAttemptId).toBe(oldId);
  });

  it("deletes attempts and tombstones block resurrection", () => {
    const wav = validateWavBytes(makeWavBytes());
    const id = "44444444-4444-4444-8444-444444444444";
    createAttempt({ id, ...meta(), wav });
    deleteAttempt(id);
    expect(getAttemptDetail(id)).toBeNull();
    expect(getAttemptAudio(id)).toBeNull();
    expect(() => createAttempt({ id, ...meta(), wav })).toThrowError("deleted");
    // Repeat deletion succeeds.
    expect(deleteAttempt(id)).toBe(true);
  });

  it("paginates stably with identical timestamps", () => {
    const wav = validateWavBytes(makeWavBytes());
    const ids = [
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
      "77777777-7777-4777-8777-777777777777",
    ];
    for (const id of ids) createAttempt({ id, ...meta(), wav });
    const first = listAttempts({ limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = listAttempts({ limit: 2, cursor: first.nextCursor! });
    expect(second.items).toHaveLength(1);
    const all = [...first.items.map((i) => i.id), ...second.items.map((i) => i.id)];
    expect(new Set(all).size).toBe(3);
  });

  it("snapshotDatabase restores metadata, feedback, and playable WAV bytes", async () => {
    const wav = validateWavBytes(makeWavBytes());
    const id = "88888888-8888-4888-8888-888888888888";
    createAttempt({ id, ...meta(), wav });
    saveEvaluation(id, {
      evaluationId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      expectedRevision: 0,
      evaluatedAt: new Date().toISOString(),
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
        pronunciationScore: 77,
        words: [],
        insertedWords: [],
      },
    });
    const target = join(dir, "backup.sqlite");
    snapshotDatabase(target);
    // Open the snapshot in isolation and verify playable WAV bytes.
    closeDb();
    process.env.CLEARSPEAK_DATA_DIR = dir;
    const { DatabaseSync } = await import("node:sqlite");
    const snap = new DatabaseSync(target);
    const row = snap.prepare("SELECT reference_text, evaluation_json FROM attempts WHERE id = ?").get(id) as {
      reference_text: string;
      evaluation_json: string;
    };
    expect(row.reference_text).toBe("She worked hard.");
    expect(JSON.parse(row.evaluation_json).pronunciationScore).toBe(77);
    const audio = snap.prepare("SELECT wav FROM audio WHERE attempt_id = ?").get(id) as { wav: Uint8Array };
    expect(validateWavBytes(Buffer.from(audio.wav)).byteLength).toBeGreaterThan(1000);
    snap.close();
  });
});
