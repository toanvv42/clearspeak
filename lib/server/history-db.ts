import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS attempts (
    id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    recorded_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    stop_reason TEXT NOT NULL,
    reference_text TEXT NOT NULL,
    title TEXT,
    level TEXT,
    source_kind TEXT NOT NULL,
    source_id TEXT,
    source_version INTEGER,
    source_hash TEXT,
    scope TEXT NOT NULL DEFAULT 'passage',
    locale TEXT NOT NULL DEFAULT 'en-US',
    evaluation_state TEXT NOT NULL DEFAULT 'pending',
    revision INTEGER NOT NULL DEFAULT 0,
    evaluation_id TEXT,
    evaluated_at TEXT,
    assessment_config_json TEXT,
    evaluation_json TEXT,
    failure_kind TEXT,
    failure_message TEXT,
    pronunciation_score REAL,
    accuracy_score REAL,
    fluency_score REAL,
    completeness_score REAL,
    prosody_score REAL,
    evaluation_schema_version INTEGER
  );
  CREATE TABLE IF NOT EXISTS audio (
    attempt_id TEXT PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
    wav BLOB NOT NULL,
    byte_length INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    channels INTEGER NOT NULL,
    sample_rate INTEGER NOT NULL,
    bits INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tombstones (
    id TEXT PRIMARY KEY,
    deleted_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_attempts_recorded ON attempts(recorded_at DESC, id DESC);`,
  `CREATE TABLE IF NOT EXISTS favourites (
    target_key TEXT PRIMARY KEY,
    passage_id TEXT NOT NULL,
    passage_version INTEGER NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS review_state (
    target_key TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    passage_id TEXT,
    passage_version INTEGER,
    title TEXT NOT NULL,
    latest_attempt_id TEXT NOT NULL,
    last_practiced_at TEXT NOT NULL,
    next_due_at TEXT NOT NULL,
    interval_step INTEGER NOT NULL DEFAULT 0,
    practice_count INTEGER NOT NULL DEFAULT 1,
    last_score REAL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_review_state_due ON review_state(next_due_at);`,
];

export function resolveDataDir(): string {
  const explicit = process.env.CLEARSPEAK_DATA_DIR?.trim();
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "CLEARSPEAK_DATA_DIR must be set in production; refusing ephemeral fallback.",
    );
  }
  return join(process.cwd(), ".data", "clearspeak");
}

let dbInstance: DatabaseSync | null = null;
let dbPathForInstance: string | null = null;

export function dbFilePath(dir?: string): string {
  return join(dir ?? resolveDataDir(), "clearspeak.sqlite");
}

export function getDb(): DatabaseSync {
  const dir = resolveDataDir();
  const path = dbFilePath(dir);
  if (dbInstance && dbPathForInstance === path) return dbInstance;
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      /* ignore */
    }
    dbInstance = null;
    dbPathForInstance = null;
  }
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    throw Object.assign(new Error("storage-unavailable: cannot create data directory"), {
      code: "storage-unavailable",
    });
  }
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(path);
  } catch (err) {
    throw Object.assign(new Error("storage-unavailable: cannot open database"), {
      code: "storage-unavailable",
      cause: err,
    });
  }
  try {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA busy_timeout = 5000;");
    db.exec("PRAGMA synchronous = FULL;");
    applyMigrations(db);
  } catch (err) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    throw err;
  }
  dbInstance = db;
  dbPathForInstance = path;
  void existsSync;
  return db;
}

function appliedVersions(db: DatabaseSync): Set<number> {
  try {
    const rows = db.prepare("SELECT version FROM schema_migrations").all() as Array<{
      version: number;
    }>;
    return new Set(rows.map((r) => Number(r.version)));
  } catch {
    return new Set();
  }
}

function applyMigrations(db: DatabaseSync): void {
  const applied = appliedVersions(db);
  MIGRATIONS.forEach((sql, index) => {
    const version = index + 1;
    if (applied.has(version)) return;
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        version,
        new Date().toISOString(),
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
  });
}

/** Test-only: close and reset the singleton so temp dirs stay isolated. */
export function closeDb(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      /* ignore */
    }
  }
  dbInstance = null;
  dbPathForInstance = null;
}

/** Consistent snapshot for backups. Uses VACUUM INTO so WAL content is included. */
export function snapshotDatabase(targetPath: string): void {
  const db = getDb();
  const safe = targetPath.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${safe}';`);
}
