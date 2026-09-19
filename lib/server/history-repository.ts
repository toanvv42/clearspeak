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
import {
  MAX_REVIEW_STEP,
  advanceReviewStep,
  isDue,
  nextDueAt,
  parseReviewTargetKey,
  reviewTargetFromSource,
  reviewTargetKey,
  type DueReviewItem,
  type FavouritePassage,
  type ReviewTarget,
  type TargetStats,
  type WeeklyPracticeCount,
} from "@/lib/review-schedule";

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
      if (payload.result) recordReviewPracticeForAttempt(db, attemptId, row, payload);
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
  if (payload.result) recordReviewPracticeForAttempt(db, attemptId, updated, payload);
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
  const row = db.prepare("SELECT * FROM attempts WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  const reviewTarget =
    row?.evaluation_state === "success" ? reviewTargetFromSource(attemptSourceOf(row)) : null;
  db.exec("BEGIN IMMEDIATE;");
  try {
    db.prepare("INSERT OR IGNORE INTO tombstones (id, deleted_at) VALUES (?, ?)").run(id, now);
    db.prepare("DELETE FROM attempts WHERE id = ?").run(id);
    if (reviewTarget) rebuildReviewState(db, reviewTarget);
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

// --- Progress and review (Milestone 3) ---

function attemptSourceOf(row: Record<string, unknown>):
  | { kind: "library"; id: string; version: number }
  | { kind: "custom"; hash: string } {
  return (row.source_kind as string) === "library"
    ? { kind: "library", id: row.source_id as string, version: Number(row.source_version) }
    : { kind: "custom", hash: (row.source_hash as string) ?? "" };
}

/**
 * Record a successful practice for spaced review. Idempotent: a replay of the
 * same evaluation never advances the schedule twice — only a strictly newer
 * practice timestamp moves the interval forward.
 */
export function recordReviewPracticeForAttempt(
  db: DatabaseSync,
  attemptId: string,
  attemptRow: Record<string, unknown>,
  payload: EvaluationPayload,
): void {
  const source = attemptSourceOf(attemptRow);
  const target = reviewTargetFromSource(source);
  const targetKey = reviewTargetKey(target);
  const practicedAt = payload.evaluatedAt;
  const score = scoresFromResult(payload.result ?? null).pronunciationScore;
  const title =
    ((attemptRow.title as string | null) ?? null) ||
    (attemptRow.reference_text as string).slice(0, 60);
  const existing = db.prepare("SELECT * FROM review_state WHERE target_key = ?").get(targetKey) as
    | Record<string, unknown>
    | undefined;
  const now = new Date().toISOString();
  if (!existing) {
    db.prepare(
      `INSERT INTO review_state (target_key, kind, passage_id, passage_version, title, latest_attempt_id, last_practiced_at, next_due_at, interval_step, practice_count, last_score, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
    ).run(
      targetKey,
      target.kind,
      target.kind === "library" ? target.id : null,
      target.kind === "library" ? target.version : null,
      title,
      attemptId,
      practicedAt,
      nextDueAt(practicedAt, 0),
      score,
      now,
    );
    return;
  }
  // Stale or duplicate evaluation (offline replay, retry): never move backwards.
  if ((existing.last_practiced_at as string) >= practicedAt) return;
  const step = advanceReviewStep(Number(existing.interval_step ?? 0));
  db.prepare(
    `UPDATE review_state SET title = ?, latest_attempt_id = ?, last_practiced_at = ?, next_due_at = ?, interval_step = ?, practice_count = practice_count + 1, last_score = ?, updated_at = ? WHERE target_key = ?`,
  ).run(title, attemptId, practicedAt, nextDueAt(practicedAt, step), step, score, now, targetKey);
}

function rowToDueItem(row: Record<string, unknown>): DueReviewItem {
  return {
    targetKey: row.target_key as string,
    kind: (row.kind as string) === "library" ? "library" : "custom",
    title: row.title as string,
    passageId: (row.passage_id as string | null) ?? null,
    passageVersion:
      row.passage_version === null || row.passage_version === undefined
        ? null
        : Number(row.passage_version),
    latestAttemptId: row.latest_attempt_id as string,
    lastPracticedAt: row.last_practiced_at as string,
    nextDueAt: row.next_due_at as string,
    intervalStep: Number(row.interval_step ?? 0),
    practiceCount: Number(row.practice_count ?? 1),
    lastScore: (row.last_score as number | null) ?? null,
  };
}

/** Review targets whose due date has passed, most overdue first. */
export function getDueReviews(now?: string): DueReviewItem[] {
  const db = getDb();
  const current = now ?? new Date().toISOString();
  const rows = db
    .prepare(`SELECT * FROM review_state ORDER BY next_due_at ASC, last_practiced_at ASC`)
    .all() as Record<string, unknown>[];
  return rows.map(rowToDueItem).filter((item) => isDue(item.nextDueAt, current));
}

function reviewRowsForTarget(db: DatabaseSync, target: ReviewTarget): Record<string, unknown>[] {
  return (target.kind === "library"
    ? db
        .prepare(
          `SELECT * FROM attempts WHERE evaluation_state = 'success' AND source_kind = 'library' AND source_id = ? AND source_version = ? ORDER BY COALESCE(evaluated_at, recorded_at) ASC, id ASC`,
        )
        .all(target.id, target.version)
    : db
        .prepare(
          `SELECT * FROM attempts WHERE evaluation_state = 'success' AND source_kind = 'custom' AND source_hash = ? ORDER BY COALESCE(evaluated_at, recorded_at) ASC, id ASC`,
        )
        .all(target.hash)) as Record<string, unknown>[];
}

function rebuildReviewState(db: DatabaseSync, target: ReviewTarget): void {
  const targetKey = reviewTargetKey(target);
  const rows = reviewRowsForTarget(db, target);
  if (rows.length === 0) {
    db.prepare("DELETE FROM review_state WHERE target_key = ?").run(targetKey);
    return;
  }
  const latest = rows[rows.length - 1];
  const practicedAt = ((latest.evaluated_at as string | null) ?? latest.recorded_at) as string;
  const title =
    ((latest.title as string | null) ?? null) ||
    (latest.reference_text as string).slice(0, 60);
  const step = Math.min(MAX_REVIEW_STEP, rows.length - 1);
  db.prepare(
    `INSERT INTO review_state (target_key, kind, passage_id, passage_version, title, latest_attempt_id, last_practiced_at, next_due_at, interval_step, practice_count, last_score, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(target_key) DO UPDATE SET
       kind = excluded.kind,
       passage_id = excluded.passage_id,
       passage_version = excluded.passage_version,
       title = excluded.title,
       latest_attempt_id = excluded.latest_attempt_id,
       last_practiced_at = excluded.last_practiced_at,
       next_due_at = excluded.next_due_at,
       interval_step = excluded.interval_step,
       practice_count = excluded.practice_count,
       last_score = excluded.last_score,
       updated_at = excluded.updated_at`,
  ).run(
    targetKey,
    target.kind,
    target.kind === "library" ? target.id : null,
    target.kind === "library" ? target.version : null,
    title,
    latest.id,
    practicedAt,
    nextDueAt(practicedAt, step),
    step,
    rows.length,
    (latest.pronunciation_score as number | null) ?? null,
    new Date().toISOString(),
  );
}

/** First/latest/best pronunciation scores across successful attempts for one target. */
export function getTargetStats(targetKey: string): TargetStats {
  const db = getDb();
  const target = parseReviewTargetKey(targetKey);
  if (!target) return { targetKey, title: targetKey, attempts: 0, first: null, latest: null, best: null };
  const rows = (
    target.kind === "library"
      ? db
          .prepare(
            `SELECT pronunciation_score, recorded_at, title, reference_text FROM attempts WHERE evaluation_state = 'success' AND source_kind = 'library' AND source_id = ? AND source_version = ? ORDER BY recorded_at ASC, id ASC`,
          )
          .all(target.id, target.version)
      : db
          .prepare(
            `SELECT pronunciation_score, recorded_at, title, reference_text FROM attempts WHERE evaluation_state = 'success' AND source_kind = 'custom' AND source_hash = ? ORDER BY recorded_at ASC, id ASC`,
          )
          .all(target.hash)
  ) as Array<{
    pronunciation_score: number | null;
    recorded_at: string;
    title: string | null;
    reference_text: string;
  }>;
  return statsFromRows(targetKey, rows);
}

function statsFromRows(
  targetKey: string,
  rows: Array<{
    pronunciation_score: number | null;
    recorded_at: string;
    title: string | null;
    reference_text: string;
  }>,
): TargetStats {
  if (rows.length === 0) {
    return { targetKey, title: targetKey, attempts: 0, first: null, latest: null, best: null };
  }
  const scored = rows.filter((r) => typeof r.pronunciation_score === "number");
  const best =
    scored.length > 0
      ? scored.reduce((a, b) =>
          (b.pronunciation_score as number) > (a.pronunciation_score as number) ? b : a,
        )
      : null;
  return {
    targetKey,
    title: rows[rows.length - 1].title || rows[rows.length - 1].reference_text.slice(0, 60),
    attempts: rows.length,
    first: { score: rows[0].pronunciation_score, at: rows[0].recorded_at },
    latest: {
      score: rows[rows.length - 1].pronunciation_score,
      at: rows[rows.length - 1].recorded_at,
    },
    best: best ? { score: best.pronunciation_score, at: best.recorded_at } : null,
  };
}

/** Comparable statistics for every successfully evaluated practice target. */
export function getAllTargetStats(): TargetStats[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT source_kind, source_id, source_version, source_hash, pronunciation_score, recorded_at, title, reference_text
       FROM attempts
       WHERE evaluation_state = 'success'
       ORDER BY recorded_at ASC, id ASC`,
    )
    .all() as Array<{
      source_kind: string;
      source_id: string | null;
      source_version: number | null;
      source_hash: string | null;
      pronunciation_score: number | null;
      recorded_at: string;
      title: string | null;
      reference_text: string;
    }>;
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const targetKey = reviewTargetKey(
      row.source_kind === "library"
        ? { kind: "library", id: row.source_id ?? "", version: Number(row.source_version) }
        : { kind: "custom", hash: row.source_hash ?? "" },
    );
    const group = grouped.get(targetKey);
    if (group) group.push(row);
    else grouped.set(targetKey, [row]);
  }
  return Array.from(grouped, ([targetKey, targetRows]) => statsFromRows(targetKey, targetRows))
    .sort((a, b) => (b.latest?.at ?? "").localeCompare(a.latest?.at ?? ""));
}

/** Attempt counts per UTC day for the trailing `days` (default 7). */
export function getWeeklyCounts(days = 7): WeeklyPracticeCount[] {
  const db = getDb();
  const span = Math.max(1, Math.min(30, days));
  const today = new Date().toISOString().slice(0, 10);
  const counts = new Map<string, number>();
  const rows = db
    .prepare(
      `SELECT substr(recorded_at, 1, 10) AS day, COUNT(*) AS n FROM attempts WHERE recorded_at >= date(?, ?) GROUP BY day`,
    )
    .all(today, `-${span - 1} days`) as Array<{ day: string; n: number }>;
  for (const r of rows) counts.set(r.day, Number(r.n));
  const out: WeeklyPracticeCount[] = [];
  for (let i = span - 1; i >= 0; i -= 1) {
    const date = new Date(Date.parse(`${today}T00:00:00.000Z`) - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    out.push({ date, attempts: counts.get(date) ?? 0 });
  }
  return out;
}

export function listFavourites(): FavouritePassage[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM favourites ORDER BY created_at DESC LIMIT 200`)
    .all() as Record<string, unknown>[];
  return rows.map((row) => ({
    targetKey: row.target_key as string,
    passageId: row.passage_id as string,
    passageVersion: Number(row.passage_version),
    title: row.title as string,
    createdAt: row.created_at as string,
  }));
}

export function addFavourite(passageId: string, passageVersion: number, title: string): FavouritePassage {
  const db = getDb();
  const targetKey = reviewTargetKey({ kind: "library", id: passageId, version: passageVersion });
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO favourites (target_key, passage_id, passage_version, title, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(target_key) DO UPDATE SET title = excluded.title`,
  ).run(targetKey, passageId, passageVersion, title.slice(0, 200), now);
  return { targetKey, passageId, passageVersion, title: title.slice(0, 200), createdAt: now };
}

export function removeFavourite(targetKey: string): boolean {
  const db = getDb();
  const res = db.prepare(`DELETE FROM favourites WHERE target_key = ?`).run(targetKey);
  return Number(res.changes ?? 0) > 0;
}

/** Compact export: summaries plus review/favourite state. Never includes audio. */
export function exportHistory(limit = 500): {
  version: 1;
  exportedAt: string;
  attempts: AttemptSummary[];
  review: DueReviewItem[];
  favourites: FavouritePassage[];
} {
  const db = getDb();
  const bounded = Math.max(1, Math.min(2000, limit));
  const rows = db
    .prepare(
      `SELECT id, schema_version, recorded_at, duration_ms, stop_reason, reference_text, title, level, source_kind, source_id, source_version, source_hash, scope, locale, evaluation_state, revision, pronunciation_score, accuracy_score, fluency_score, completeness_score, prosody_score FROM attempts ORDER BY recorded_at DESC, id DESC LIMIT ?`,
    )
    .all(bounded) as Record<string, unknown>[];
  const review = (
    db.prepare(`SELECT * FROM review_state ORDER BY last_practiced_at DESC LIMIT 500`).all() as Record<
      string,
      unknown
    >[]
  ).map(rowToDueItem);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    attempts: rows.map(rowToSummary),
    review,
    favourites: listFavourites(),
  };
}
