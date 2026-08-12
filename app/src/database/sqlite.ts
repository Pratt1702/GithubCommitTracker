import Database from 'better-sqlite3';
import path from 'path';
import log from 'electron-log';

/**
 * Better-SQLite3 connection.
 * Dev/tests keep the DB in the project root; packaged builds use
 * app.getPath('userData') so upgrades never wipe collected history.
 */
let dbPath: string;
// An explicit override always wins — used by the verification harness and tests
// so they never touch the real database.
if (process.env.COMMITTRACKER_DB) {
  dbPath = path.resolve(process.env.COMMITTRACKER_DB);
} else if (process.versions.electron) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron');
    const dir = app.isPackaged ? app.getPath('userData') : process.cwd();
    dbPath = path.resolve(dir, 'committracker.db');
  } catch {
    dbPath = path.resolve(process.cwd(), 'committracker.db');
  }
} else {
  dbPath = process.env.COMMITTRACKER_DB ?? path.resolve(process.cwd(), 'committracker.db');
}

const db = new Database(dbPath);

/**
 * Baseline schema.
 *
 * Design note — this is the core fix over the original Python script:
 * we store one row per (student, date) holding the ABSOLUTE contribution count
 * scraped from GitHub's calendar, not a day-over-day diff. Re-running a refresh
 * on the same day therefore OVERWRITES that day's value instead of subtracting a
 * stale total from itself, so refreshing is idempotent and safe to repeat.
 *
 * Cohorts are the top-level unit of organisation (e.g. "2026 Batch — CSE B").
 * Every student belongs to exactly one cohort; deleting a cohort removes its
 * students and their history via ON DELETE CASCADE.
 */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS cohorts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    batch       TEXT    NOT NULL DEFAULT '',
    dept        TEXT    NOT NULL DEFAULT '',
    section     TEXT    NOT NULL DEFAULT '',
    notes       TEXT    NOT NULL DEFAULT '',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS students (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    cohort_id   INTEGER NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    reg_no      TEXT    NOT NULL DEFAULT '',
    dept        TEXT    NOT NULL DEFAULT '',
    link        TEXT    NOT NULL,
    username    TEXT    NOT NULL COLLATE NOCASE,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  )`,
  // A GitHub account is unique *within* a cohort: the same student could
  // legitimately appear in two different cohorts (e.g. a repeated subject).
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_student_cohort_username
     ON students(cohort_id, username)`,
  `CREATE INDEX IF NOT EXISTS idx_student_cohort ON students(cohort_id)`,
  `CREATE TABLE IF NOT EXISTS contributions (
    student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    date        TEXT    NOT NULL,
    count       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (student_id, date)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_contrib_date ON contributions(date)`,
  `CREATE INDEX IF NOT EXISTS idx_contrib_student_date ON contributions(student_id, date)`,
  `CREATE TABLE IF NOT EXISTS sync_state (
    student_id     INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
    last_synced_at TEXT,
    last_error     TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS refresh_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    cohort_id       INTEGER REFERENCES cohorts(id) ON DELETE SET NULL,
    started_at      TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at     TEXT,
    students_total  INTEGER NOT NULL DEFAULT 0,
    students_ok     INTEGER NOT NULL DEFAULT 0,
    students_failed INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'running'
  )`,
  `CREATE TABLE IF NOT EXISTS metadata (
    key   TEXT PRIMARY KEY,
    value TEXT
  )`,
];

/** Columns added after the first release, applied idempotently. */
const MIGRATIONS: Array<{ table: string; column: string; ddl: string }> = [
  { table: 'students', column: 'reg_no', ddl: `ALTER TABLE students ADD COLUMN reg_no TEXT NOT NULL DEFAULT ''` },
  { table: 'refresh_runs', column: 'cohort_id', ddl: `ALTER TABLE refresh_runs ADD COLUMN cohort_id INTEGER` },
  { table: 'students', column: 'email', ddl: `ALTER TABLE students ADD COLUMN email TEXT NOT NULL DEFAULT ''` },
];

function columnExists(table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

export function initDb(): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  log.info(`Initializing SQLite database at ${dbPath}`);

  for (const sql of SCHEMA) db.exec(sql);

  for (const m of MIGRATIONS) {
    try {
      if (!columnExists(m.table, m.column)) {
        db.exec(m.ddl);
        log.info(`Applied migration: ${m.table}.${m.column}`);
      }
    } catch (err) {
      log.error(`Migration ${m.table}.${m.column} failed:`, err);
    }
  }

  // Any run left 'running' from a crash/force-quit is stale.
  db.prepare(
    `UPDATE refresh_runs SET status = 'failed', finished_at = datetime('now') WHERE status = 'running'`,
  ).run();
}

export function getDbPath(): string {
  return dbPath;
}

export default db;
