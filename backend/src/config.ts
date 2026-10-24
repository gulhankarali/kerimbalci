import path from 'path';
import dotenv from 'dotenv';

// Repo root is one level above backend/. Secrets live in <repo>/.env.
export const BACKEND_ROOT = path.resolve(__dirname, '..');
export const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');

dotenv.config({ path: path.join(REPO_ROOT, '.env') });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name} (see .env.example)`);
  return v;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} must be a number, got "${v}"`);
  return n;
}

// DATABASE_PATH is resolved relative to the backend package directory.
const rawDbPath = process.env.DATABASE_PATH || './data/app.sqlite';

export const config = {
  ghost: {
    url: required('GHOST_API_URL').replace(/\/+$/, ''),
    adminKey: required('GHOST_ADMIN_API_KEY'),
  },
  alertEmail: process.env.ALERT_EMAIL || '',
  milestoneMonths: num('BOOK_MILESTONE_MONTHS', 12),
  trialDays: num('TRIAL_DAYS', 7),
  cronTimeGmt: process.env.CRON_TIME_GMT || '06:00',
  // "Day zero" for trend charts: history is reconstructed from this date forward.
  genesisDate: process.env.GENESIS_DATE || '2026-10-15',
  dbPath: path.isAbsolute(rawDbPath) ? rawDbPath : path.join(BACKEND_ROOT, rawDbPath),
  port: num('PORT', 4000),
};

// Average days per month, used to convert accrued duration <-> months.
export const DAYS_PER_MONTH = 365.25 / 12;
