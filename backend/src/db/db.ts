import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { config } from '../config';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS members (
  id                TEXT PRIMARY KEY,
  email             TEXT,
  name              TEXT,
  status            TEXT,              -- free | paid | comped
  comped            INTEGER DEFAULT 0,
  tier              TEXT,
  sub_status        TEXT,              -- latest subscription status (trialing/active/...)
  interval          TEXT,              -- month | year
  trial_end_at      TEXT,             -- when the paid clock starts
  created_at        TEXT,
  updated_at        TEXT,
  accrued_days      REAL DEFAULT 0,    -- cumulative paid time, derived from paid_periods
  accrued_months    REAL DEFAULT 0,
  current_state     TEXT,              -- free | in_trial | active | paused | comped | completed
  book_sent         INTEGER DEFAULT 0,
  book_sent_at      TEXT,
  last_synced_at    TEXT
);

CREATE TABLE IF NOT EXISTS paid_periods (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id    TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end   TEXT,                   -- NULL = currently open/ongoing
  source       TEXT DEFAULT 'ghost',
  FOREIGN KEY (member_id) REFERENCES members(id)
);
CREATE INDEX IF NOT EXISTS idx_paid_periods_member ON paid_periods(member_id);
CREATE INDEX IF NOT EXISTS idx_paid_periods_open ON paid_periods(member_id, period_end);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   TEXT NOT NULL,
  type        TEXT NOT NULL,           -- pause | resume | milestone_reached | ...
  occurred_at TEXT,
  detected_at TEXT,
  detail      TEXT,
  FOREIGN KEY (member_id) REFERENCES members(id)
);
CREATE INDEX IF NOT EXISTS idx_events_member ON events(member_id);

CREATE TABLE IF NOT EXISTS email_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  TEXT,
  type       TEXT NOT NULL,            -- admin_book_alert | customer_retention
  sent_at    TEXT,
  context    TEXT
);
CREATE INDEX IF NOT EXISTS idx_email_log_member ON email_log(member_id, type);

CREATE TABLE IF NOT EXISTS sync_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at    TEXT,
  finished_at   TEXT,
  members_seen  INTEGER,
  pauses        INTEGER,
  resumes       INTEGER,
  milestones    INTEGER,
  error         TEXT
);
`;

// Additive column migrations: add any missing columns to existing databases
// without dropping data. Each entry is [table, column, definition].
const MIGRATIONS: [string, string, string][] = [
  ['members', 'plan_amount', 'INTEGER'], // subscription price in minor units (cents)
  ['members', 'currency', 'TEXT'],
];

function runMigrations(db: Database.Database): void {
  for (const [table, column, def] of MIGRATIONS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    }
  }
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  const db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  runMigrations(db);
  _db = db;
  return db;
}
