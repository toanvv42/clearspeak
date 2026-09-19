import type { DatabaseSync } from "node:sqlite";
import { getDb } from "@/lib/server/history-db";
import {
  EVALUATION_SCHEMA_VERSION,
  type AttemptDetail,
  type AttemptSummary,
  type EvaluationPayload,
} from "@/lib/history/types";
import { scoresFromResult } from "@/lib/history/validation";
import type { ValidatedWav } from "@/lib/server/wav-validate";

export type CreateAttemptInput = {
  id: string;
  schemaVersion: number;
  recordedAt: string;
  durationMs: number;
  stopReason: "manual" | "limit";
  referenceText: string;
  title: string | null;
  level: string | null;
  source: { kind: "library"; id: string; version: number } | { kind: "custom"; hash: string };
  scope: "passage";
  locale: string;
  wav: ValidatedWav;
};

function rowToSummary(row: Record<string, unknown>): AttemptSummary {
  const sourceKind = row.source_kind as string;
  return {
    id: row.id as string,
    schemaVersion: Number(row.schema_version),
    recordedAt: row.recorded_at as string,
    durationMs: Number(row.duration_ms),
    stopReason: row.stop_reason as "manual" | "limit",
    referenceText: row.reference_text as string,
    title: (row.title as string | null) ?? null,
    level: (row.level as string | null) ?? null,
    source:
      sourceKind === "library"
        ? {
            kind: "library",
            id: row.source_id as string,
            version: Number(row.source_version),
          }
        : { kind: "custom", hash: (row.source_hash as string) ?? "" },
    scope: "passage",
    locale: (row.locale as string) ?? "en-US",
    evaluationState: (row.evaluation_state as AttemptSummary["evaluationState"]) ?? "pending",
    revision: Number(row.revision ?? 0),
    pronunciationScore: (row.pronunciation_score as number | null) ?? null,
    accuracyScore: (row.accuracy_score as number | null) ?? null,
    fluencyScore: (row.fluency_score as number | null) ?? null,
    completenessScore: (row.completeness_score as number | null) ?? null,
    prosodyScore: (row.prosody_score as number | null) ?? null,
    hasAudio: true,
  };
}

function rowToDetail(
  row: Record<string, unknown>,
  previous: AttemptSummary | null,
): AttemptDetail {
  const summary = rowToSummary(row);
  let evaluation: AttemptDetail["evaluation"] = null;
  if (row.evaluation_json) {
    try {
      evaluation = JSON.parse(row.evaluation_json as string);
    } catch {
      evaluation = null;
    }
  }
  let assessmentConfig: AttemptDetail["assessmentConfig"] = null;
  if (row.assessment_config_json) {
    try {
      assessmentConfig = JSON.parse(row.assessment_config_json as string);
    } catch {
      assessmentConfig = null;
    }
  }
  return {
    ...summary,
    createdAt: row.created_at as string,
    evaluationId: (row.evaluation_id as string | null) ?? null,
    evaluatedAt: (row.evaluated_at as string | null) ?? null,
    assessmentConfig,
    evaluation,
    failureKind: (row.failure_kind as string | null) ?? null,
    failureMessage: (row.failure_message as string | null) ?? null,
    previousAttemptId: previous?.id ?? null,
    previousSummary: previous,
  };
}

function isTombstoned(db: DatabaseSync, id: string): boolean {
  const row = db.prepare("SELECT id FROM tombstones WHERE id = ?").get(id);
  return Boolean(row);
}

function configKey(cfg: { provider: string; locale: string; enableProsody: boolean } | null): string | null {
  if (!cfg) return null;
  return `${cfg.provider}|${cfg.locale}|prosody:${cfg.enableProsody ? "1" : "0"}`;
}

export function findPreviousSummary(
  db: DatabaseSync,
  current: Record<string, unknown>,
): AttemptSummary | null {
  const curRef = (current.reference_text as string).replace(/\s+/g, " ").trim();
  const curSourceKind = current.source_kind as string;
  const curSourceId = current.source_id as string | null;
  const curSourceVersion = current.source_version as number | null;
  const curRecorded = current.recorded_at as string;
  const curId = current.id as string;
  const curLocale = (current.locale as string) ?? "en-US";
  const curStop = current.stop_reason as string;
  if (curStop === "limit") return null;
  let curConfigKey: string | null = null;
  try {
    curConfigKey = current.assessment_config_json
      ? configKey(JSON.parse(current.assessment_config_json as string))
      : null;
  } catch {
    curConfigKey = null;
  }
  // Scope candidates in SQL by the full comparison identity (text, source,
  // locale) so unrelated practice cannot push the matching take out of range.
  // Config-key/schema-version filtering stays in JS over the closest matches.
  const candidateRows = (
    curSourceKind === "library"
      ? db
          .prepare(
            `SELECT * FROM attempts WHERE recorded_at <= ? AND id != ? AND evaluation_state = 'success' AND stop_reason != 'limit' AND locale = ? AND reference_text = ? AND source_kind = 'library' AND source_id = ? AND source_version = ? ORDER BY recorded_at DESC, id DESC LIMIT 10`,
          )
          .all(curRecorded, curId, curLocale, curRef, curSourceId, Number(curSourceVersion))
      : db
          .prepare(
            `SELECT * FROM attempts WHERE recorded_at <= ? AND id != ? AND evaluation_state = 'success' AND stop_reason != 'limit' AND locale = ? AND reference_text = ? AND source_kind = 'custom' ORDER BY recorded_at DESC, id DESC LIMIT 10`,
          )
          .all(curRecorded, curId, curLocale, curRef)
  ) as Record<string, unknown>[];
  for (const r of candidateRows) {
    let candKey: string | null = null;
    try {
      candKey = r.assessment_config_json
        ? configKey(JSON.parse(r.assessment_config_json as string))
        : null;
    } catch {
      candKey = null;
    }
    if (curConfigKey && candKey && curConfigKey !== candKey) continue;
    const schemaV = r.evaluation_schema_version as number | null;
    if (schemaV !== null && schemaV !== undefined && Number(schemaV) !== EVALUATION_SCHEMA_VERSION)
      continue;
    return rowToSummary(r);
  }
  return null;
}

export function createAttempt(input: CreateAttemptInput): { summary: AttemptSummary; created: boolean } {
  const db = getDb();
  if (isTombstoned(db, input.id)) {
    throw Object.assign(new Error("deleted"), { code: "deleted" });
  }
  const existing = db.prepare("SELECT * FROM attempts WHERE id = ?").get(input.id) as
    | Record<string, unknown>
    | undefined;
  if (existing) {
    // Idempotent retry: the full immutable metadata must match, not just the
    // audio. A changed timestamp, title, source identity, stop reason, level,
    // or locale under an existing ID is a conflict, never a silent overwrite.
    const existingSource =
      (existing.source_kind as string) === "library"
        ? `library|${existing.source_id as string}|${Number(existing.source_version)}`
        : `custom|${(existing.source_hash as string) ?? ""}`;
    const inputSource =
      input.source.kind === "library"
        ? `library|${input.source.id}|${input.source.version}`
        : `custom|${input.source.hash}`;
    const same =
      (existing.reference_text as string) === input.referenceText &&
      Number(existing.duration_ms) === input.durationMs &&
      (existing.recorded_at as string) === input.recordedAt &&
      (existing.stop_reason as string) === input.stopReason &&
      ((existing.title as string | null) ?? null) === input.title &&
      ((existing.level as string | null) ?? null) === input.level &&
      existingSource === inputSource &&
      (existing.scope as string) === input.scope &&
      ((existing.locale as string) ?? "en-US") === input.locale &&
      Number(existing.schema_version) === input.schemaVersion;
    const audioRow = db.prepare("SELECT sha256 FROM audio WHERE attempt_id = ?").get(input.id) as
      | Record<string, unknown>
      | undefined;
    if (same && audioRow && (audioRow.sha256 as string) === input.wav.sha256) {
      return { summary: rowToSummary(existing), created: false };
    }
    throw Object.assign(new Error("conflict"), { code: "conflict" });
  }
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE;");
  try {
    db.prepare(
      `INSERT INTO attempts (id, schema_version, recorded_at, created_at, duration_ms, stop_reason, reference_text, title, level, source_kind, source_id, source_version, source_hash, scope, locale, evaluation_state, revision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)`,
    ).run(
      input.id,
      input.schemaVersion,
      input.recordedAt,
      now,
      input.durationMs,
      input.stopReason,
      input.referenceText,
      input.title,
      input.level,
      input.source.kind,
      input.source.kind === "library" ? input.source.id : null,
      input.source.kind === "library" ? input.source.version : null,
      input.source.kind === "custom" ? input.source.hash : null,
      input.scope,
      input.locale,
    );
    db.prepare(
      `INSERT INTO audio (attempt_id, wav, byte_length, sha256, channels, sample_rate, bits) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      input.wav.bytes,
      input.wav.byteLength,
      input.wav.sha256,
      input.wav.channels,
      input.wav.sampleRate,
      input.wav.bits,
    );
    db.exec("COMMIT;");
  } catch (err) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      /* ignore */
    }
    if ((err as Error).message?.includes("UNIQUE") || (err as Error).message?.includes("PRIMARY")) {
      throw Object.assign(new Error("conflict"), { code: "conflict" });
    }
    const sqliteErr = err as { code?: string | number; message?: string };
    if (sqliteErr.code === "SQLITE_BUSY") throw Object.assign(new Error("busy"), { code: "busy" });
    throw err;
  }
  const row = db.prepare("SELECT * FROM attempts WHERE id = ?").get(input.id) as Record<
    string,
    unknown
  >;
  return { summary: rowToSummary(row), created: true };
}

export function saveEvaluation(
  attemptId: string,
  payload: EvaluationPayload,
): AttemptDetail {
  const db = getDb();
  if (isTombstoned(db, attemptId)) throw Object.assign(new Error("deleted"), { code: "deleted" });
  const row = db.prepare("SELECT * FROM attempts WHERE id = ?").get(attemptId) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw Object.assign(new Error("not-found"), { code: "not-found" });
  // Idempotent replay: same evaluation id with identical content succeeds.
  if ((row.evaluation_id as string | null) === payload.evaluationId) {
    const sameResult =
      JSON.stringify(row.evaluation_json ? JSON.parse(row.evaluation_json as string) : null) ===
      JSON.stringify(payload.result ?? null);
    const sameFailure =
      (row.failure_kind ?? null) === (payload.failure?.kind ?? null) &&
      (row.failure_message ?? null) === (payload.failure?.message ?? null);
    if (sameResult && sameFailure) {
      return rowToDetail(row, findPreviousSummary(db, row));
    }
    throw Object.assign(new Error("conflict"), { code: "conflict" });
  }
  if (Number(row.revision ?? 0) !== payload.expectedRevision) {
    throw Object.assign(new Error("conflict"), { code: "conflict" });
  }
  // A delayed failure must not overwrite an existing success.
  if (row.evaluation_state === "success" && payload.failure) {
    throw Object.assign(new Error("conflict"), { code: "conflict" });
  }
  // Bind the evaluation to this attempt's passage: a result assessed against
  // different text must never be stored under this attempt ID.
  if (payload.result) {
    const storedRef = (row.reference_text as string).replace(/\s+/g, " ").trim();
    const resultRef = payload.result.referenceText.replace(/\s+/g, " ").trim();
    if (storedRef !== resultRef) {
      throw Object.assign(new Error("reference-mismatch"), { code: "invalid" });
    }
  }
  const scores = scoresFromResult(payload.result ?? null);
  db.exec("BEGIN IMMEDIATE;");
  try {
    db.prepare(
      `UPDATE attempts SET evaluation_state = ?, revision = revision + 1, evaluation_id = ?, evaluated_at = ?, assessment_config_json = ?, evaluation_json = ?, failure_kind = ?, failure_message = ?, pronunciation_score = ?, accuracy_score = ?, fluency_score = ?, completeness_score = ?, prosody_score = ?, evaluation_schema_version = ? WHERE id = ? AND revision = ?`,
    ).run(
      payload.result ? "success" : "failed",
      payload.evaluationId,
      payload.evaluatedAt,
      JSON.stringify(payload.assessmentConfig),
      payload.result ? JSON.stringify(payload.result) : null,
      payload.failure?.kind ?? null,
      payload.failure?.message ?? null,
      scores.pronunciationScore,
      scores.accuracyScore,
      scores.fluencyScore,
      scores.completenessScore,
      scores.prosodyScore,
      EVALUATION_SCHEMA_VERSION,
      attemptId,
      payload.expectedRevision,
    );
    db.exec("COMMIT;");
  } catch (err) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      /* ignore */
    }
    throw err;
  }
  const updated = db.prepare("SELECT * FROM attempts WHERE id = ?").get(attemptId) as Record<
    string,
    unknown
  >;
  if (Number(updated.revision) !== payload.expectedRevision + 1) {
    throw Object.assign(new Error("conflict"), { code: "conflict" });
  }
  return rowToDetail(updated, findPreviousSummary(db, updated));
}

export type ListParams = {
  search?: string;
  filter?: "all" | "evaluated" | "pending" | "failed";
  cursor?: string;
  limit?: number;
};

export function listAttempts(params: ListParams): { items: AttemptSummary[]; nextCursor: string | null } {
  const db = getDb();
  const limit = Math.max(1, Math.min(50, params.limit ?? 20));
  const clauses: string[] = [];
  const args: unknown[] = [];
  if (params.filter === "evaluated") clauses.push("evaluation_state = 'success'");
  else if (params.filter === "pending") clauses.push("evaluation_state = 'pending'");
  else if (params.filter === "failed") clauses.push("evaluation_state = 'failed'");
  if (params.search) {
    clauses.push("(reference_text LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\')");
    const esc = params.search.replace(/[\\%_]/g, (c) => `\\${c}`);
    args.push(`%${esc}%`, `%${esc}%`);
  }
  if (params.cursor) {
    const [cursorTime, cursorId] = Buffer.from(params.cursor, "base64url").toString("utf8").split("|");
    if (cursorTime && cursorId) {
      clauses.push("(recorded_at < ? OR (recorded_at = ? AND id < ?))");
      args.push(cursorTime, cursorTime, cursorId);
    }
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT id, schema_version, recorded_at, duration_ms, stop_reason, reference_text, title, level, source_kind, source_id, source_version, source_hash, scope, locale, evaluation_state, revision, pronunciation_score, accuracy_score, fluency_score, completeness_score, prosody_score FROM attempts ${where} ORDER BY recorded_at DESC, id DESC LIMIT ?`,
    )
    .all(...args, limit + 1) as Record<string, unknown>[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = page.map(rowToSummary);
  let nextCursor: string | null = null;
  if (hasMore && page.length > 0) {
    const last = page[page.length - 1];
    nextCursor = Buffer.from(`${last.recorded_at}|${last.id}`, "utf8").toString("base64url");
  }
  return { items, nextCursor };
}

export function getAttemptDetail(id: string): AttemptDetail | null {
  const db = getDb();
  if (isTombstoned(db, id)) return null;
  const row = db.prepare("SELECT * FROM attempts WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return rowToDetail(row, findPreviousSummary(db, row));
}

export function getAttemptAudio(id: string): { bytes: Buffer; byteLength: number } | null {
  const db = getDb();
  if (isTombstoned(db, id)) return null;
  const row = db.prepare("SELECT wav, byte_length FROM audio WHERE attempt_id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  const wav = row.wav as Uint8Array | Buffer;
  return { bytes: Buffer.from(wav), byteLength: Number(row.byte_length) };
}

export function deleteAttempt(id: string): boolean {
  const db = getDb();
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE;");
  try {
    db.prepare("INSERT OR IGNORE INTO tombstones (id, deleted_at) VALUES (?, ?)").run(id, now);
    db.prepare("DELETE FROM attempts WHERE id = ?").run(id);
    db.exec("COMMIT;");
  } catch (err) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      /* ignore */
    }
    throw err;
  }
  return true;
}
