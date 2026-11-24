import type Database from 'better-sqlite3';
import { getDb } from '../db/db';
import { fetchAllMembers, GhostMember } from '../ghost/client';
import { config } from '../config';
import {
  classifyMember,
  deriveState,
  daysToMonths,
  primarySubscription,
  MemberClassification,
} from '../domain/subscriptionAge';
import { parseCountryCode, regionForCountry } from '../domain/region';

export interface SyncResult {
  membersSeen: number;
  pauses: number;
  resumes: number;
  milestones: number;
  durationMs: number;
}

interface OpenPeriodRow {
  id: number;
  period_start: string;
}

/**
 * Sum a member's paid periods (closed + currently-open) into total days.
 * An open period (period_end IS NULL) accrues up to `nowIso`.
 */
function accruedDaysForMember(db: Database.Database, memberId: string, nowMs: number): number {
  const rows = db
    .prepare('SELECT period_start, period_end FROM paid_periods WHERE member_id = ?')
    .all(memberId) as { period_start: string; period_end: string | null }[];
  let totalMs = 0;
  for (const r of rows) {
    const start = Date.parse(r.period_start);
    const end = r.period_end ? Date.parse(r.period_end) : nowMs;
    if (end > start) totalMs += end - start;
  }
  return totalMs / (1000 * 60 * 60 * 24);
}

function countPeriods(db: Database.Database, memberId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM paid_periods WHERE member_id = ?')
    .get(memberId) as { n: number };
  return row.n;
}

function getOpenPeriod(db: Database.Database, memberId: string): OpenPeriodRow | undefined {
  return db
    .prepare('SELECT id, period_start FROM paid_periods WHERE member_id = ? AND period_end IS NULL')
    .get(memberId) as OpenPeriodRow | undefined;
}

function hasMilestoneEvent(db: Database.Database, memberId: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM events WHERE member_id = ? AND type = 'milestone_reached' LIMIT 1")
    .get(memberId);
  return !!row;
}

/**
 * Apply one member's state, updating the paid_periods ledger and recording
 * pause / resume / milestone events. Returns which transitions fired.
 */
function upsertMemberBase(
  db: Database.Database,
  member: GhostMember,
  cls: MemberClassification,
  nowIso: string,
): void {
  // Insert/refresh the member row first so paid_periods/events FKs resolve.
  // accrued_* and current_state are finalised later in the same sync.
  const countryCode = parseCountryCode(member.geolocation);
  const region = regionForCountry(countryCode);

  db.prepare(
    `INSERT INTO members (id, email, name, status, comped, tier, sub_status, interval,
        plan_amount, currency, country_code, region, trial_end_at, created_at, updated_at, last_synced_at)
     VALUES (@id, @email, @name, @status, @comped, @tier, @sub_status, @interval,
        @plan_amount, @currency, @country_code, @region, @trial_end_at, @created_at, @updated_at, @last_synced_at)
     ON CONFLICT(id) DO UPDATE SET
        email=excluded.email, name=excluded.name, status=excluded.status, comped=excluded.comped,
        tier=excluded.tier, sub_status=excluded.sub_status, interval=excluded.interval,
        plan_amount=excluded.plan_amount, currency=excluded.currency,
        country_code=excluded.country_code, region=excluded.region,
        trial_end_at=excluded.trial_end_at, created_at=excluded.created_at, updated_at=excluded.updated_at,
        last_synced_at=excluded.last_synced_at`,
  ).run({
    id: member.id,
    email: member.email,
    name: member.name,
    status: member.status,
    comped: member.comped ? 1 : 0,
    tier: cls.tier,
    sub_status: cls.subStatus,
    interval: cls.interval,
    plan_amount: cls.planAmount,
    currency: cls.currency,
    country_code: countryCode,
    region,
    trial_end_at: cls.trialEndAt,
    created_at: member.created_at,
    updated_at: member.updated_at,
    last_synced_at: nowIso,
  });
}

interface DerivedSnapshot {
  total: number;
  free: number;
  silver: number;
  gold: number;
  bronz: number;
  active: number;
  mrr: number;
}

/**
 * Reconstruct the metrics as they stood at the end of a given GMT day, using
 * each member's created_at and their subscription start_date / trial_end_at.
 * Honest caveat: this projects *current* members/subscriptions back onto their
 * own start dates — it cannot see members who churned and were deleted, nor
 * past tier changes. For a brand-new base with no churn it is an accurate
 * backfill; live days captured going forward are exact.
 */
function deriveSnapshotForDay(members: GhostMember[], dayEndMs: number): DerivedSnapshot {
  let total = 0;
  let gold = 0;
  let silver = 0;
  let bronz = 0;
  let active = 0;
  let mrrCents = 0;

  for (const m of members) {
    if (Date.parse(m.created_at) > dayEndMs) continue; // not a member yet on this day
    total++;

    const cls = classifyMember(m);
    const liveNow = cls.subStatus === 'active' || cls.subStatus === 'trialing';
    if (!liveNow) continue; // only project members who currently hold a subscription

    const sub = primarySubscription(m);
    const startedMs = sub?.start_date ? Date.parse(sub.start_date) : null;
    if (startedMs === null || startedMs > dayEndMs) continue; // subscription not started yet

    if (cls.tier === 'Gold') gold++;
    else if (cls.tier === 'Silver') silver++;
    else if (cls.tier === 'Bronz') bronz++;

    // MRR counts trialing too ("regardless of trialing").
    if (cls.planAmount) mrrCents += cls.interval === 'year' ? cls.planAmount / 12 : cls.planAmount;

    // "active" (paying) = trial already ended by this day.
    const trialEndMs = cls.trialEndAt ? Date.parse(cls.trialEndAt) : startedMs;
    if (trialEndMs <= dayEndMs) active++;
  }

  return { total, free: total - gold - silver - bronz, silver, gold, bronz, active, mrr: mrrCents / 100 };
}

function upsertSnapshotRow(
  db: Database.Database,
  date: string,
  s: DerivedSnapshot,
  takenAt: string,
  overwrite: boolean,
): void {
  const conflict = overwrite
    ? `ON CONFLICT(date) DO UPDATE SET
         total=excluded.total, free_count=excluded.free_count, silver_count=excluded.silver_count,
         gold_count=excluded.gold_count, bronz_count=excluded.bronz_count, active_count=excluded.active_count,
         mrr=excluded.mrr, arr=excluded.arr, taken_at=excluded.taken_at`
    : `ON CONFLICT(date) DO NOTHING`;
  db.prepare(
    `INSERT INTO metrics_snapshots (date, total, free_count, silver_count, gold_count, bronz_count, active_count, mrr, arr, taken_at)
     VALUES (@date, @total, @free, @silver, @gold, @bronz, @active, @mrr, @arr, @taken_at)
     ${conflict}`,
  ).run({
    date,
    total: s.total,
    free: s.free,
    silver: s.silver,
    gold: s.gold,
    bronz: s.bronz,
    active: s.active,
    mrr: s.mrr,
    arr: s.mrr * 12,
    taken_at: takenAt,
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fill the trend series from the genesis date to today:
 *  - past days: reconstructed once (INSERT OR IGNORE, never overwritten later)
 *  - today: upserted every sync with the live value
 */
function storeSnapshot(db: Database.Database, members: GhostMember[], nowIso: string): void {
  const today = nowIso.slice(0, 10); // YYYY-MM-DD GMT
  const nowMs = Date.parse(nowIso);
  const genesisMs = Date.parse(config.genesisDate + 'T00:00:00.000Z');
  const todayStartMs = Date.parse(today + 'T00:00:00.000Z');
  if (Number.isNaN(genesisMs)) return; // bad GENESIS_DATE; skip rather than crash

  for (let dayStart = genesisMs; dayStart <= todayStartMs; dayStart += DAY_MS) {
    const date = new Date(dayStart).toISOString().slice(0, 10);
    const dayEndMs = Math.min(dayStart + DAY_MS - 1, nowMs);
    const snap = deriveSnapshotForDay(members, dayEndMs);
    upsertSnapshotRow(db, date, snap, nowIso, date === today);
    // Rows written before Bronz was tracked counted Bronz members as free.
    // Fix only those tier columns once; leave the rest of the history as-is.
    db.prepare(
      `UPDATE metrics_snapshots SET free_count = @free, bronz_count = @bronz
       WHERE date = @date AND bronz_count IS NULL`,
    ).run({ date, free: snap.free, bronz: snap.bronz });
  }
}

function syncMember(
  db: Database.Database,
  member: GhostMember,
  cls: MemberClassification,
  nowIso: string,
): { paused: boolean; resumed: boolean; milestone: boolean } {
  const nowMs = Date.parse(nowIso);
  upsertMemberBase(db, member, cls, nowIso);
  const open = getOpenPeriod(db, member.id);
  let paused = false;
  let resumed = false;

  if (cls.isPaying && !open) {
    // Opening a paid period: either first observation or a resume.
    const priorPeriods = countPeriods(db, member.id);
    let start = nowIso;
    if (priorPeriods === 0 && cls.trialEndAt) {
      // First time we see an already-paying member: backdate to when paid clock started.
      start = cls.trialEndAt;
    } else if (priorPeriods > 0) {
      resumed = true;
    }
    db.prepare(
      'INSERT INTO paid_periods (member_id, period_start, period_end, source) VALUES (?, ?, NULL, ?)',
    ).run(member.id, start, 'ghost');
    if (resumed) {
      db.prepare(
        'INSERT INTO events (member_id, type, occurred_at, detected_at, detail) VALUES (?, ?, ?, ?, ?)',
      ).run(member.id, 'resume', nowIso, nowIso, `status=${cls.subStatus}`);
    }
  } else if (!cls.isPaying && open) {
    // Close the open period. Detection granularity is daily (see PLAN risks).
    db.prepare('UPDATE paid_periods SET period_end = ? WHERE id = ?').run(nowIso, open.id);
    // Only a genuine stop-paying transition is a "pause" (which later triggers a
    // retention email). Becoming comped is not a pause.
    const becameComped = member.comped || member.status === 'comped';
    if (!becameComped) {
      db.prepare(
        'INSERT INTO events (member_id, type, occurred_at, detected_at, detail) VALUES (?, ?, ?, ?, ?)',
      ).run(member.id, 'pause', nowIso, nowIso, `status=${cls.subStatus}`);
      paused = true;
    }
  }

  // Recompute accrued totals from the ledger.
  const accruedDays = accruedDaysForMember(db, member.id, nowMs);
  const accruedMonths = daysToMonths(accruedDays);
  const state = deriveState(member, cls, accruedMonths, config.milestoneMonths);

  // Milestone detection (email + book_sent flag happen in Phase 3).
  let milestone = false;
  const bookRow = db.prepare('SELECT book_sent FROM members WHERE id = ?').get(member.id) as
    | { book_sent: number }
    | undefined;
  const alreadySent = bookRow?.book_sent === 1;
  if (accruedMonths >= config.milestoneMonths && !alreadySent && !hasMilestoneEvent(db, member.id)) {
    db.prepare(
      'INSERT INTO events (member_id, type, occurred_at, detected_at, detail) VALUES (?, ?, ?, ?, ?)',
    ).run(
      member.id,
      'milestone_reached',
      nowIso,
      nowIso,
      `accrued_months=${accruedMonths.toFixed(2)}`,
    );
    milestone = true;
  }

  db.prepare(
    'UPDATE members SET accrued_days=?, accrued_months=?, current_state=? WHERE id=?',
  ).run(accruedDays, accruedMonths, state, member.id);

  return { paused, resumed, milestone };
}

/**
 * Full sync: pull all members from Ghost, update the ledger, detect transitions.
 * Idempotent — safe to run many times per day.
 */
export async function runSync(): Promise<SyncResult> {
  const db = getDb();
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  const runRow = db
    .prepare('INSERT INTO sync_runs (started_at) VALUES (?)')
    .run(startedAt);
  const runId = runRow.lastInsertRowid;

  try {
    const members = await fetchAllMembers();
    const nowIso = new Date().toISOString();
    let pauses = 0;
    let resumes = 0;
    let milestones = 0;

    const tx = db.transaction((all: GhostMember[]) => {
      for (const m of all) {
        const cls = classifyMember(m);
        const r = syncMember(db, m, cls, nowIso);
        if (r.paused) pauses++;
        if (r.resumed) resumes++;
        if (r.milestone) milestones++;
      }
      storeSnapshot(db, all, nowIso);
    });
    tx(members);

    const durationMs = Date.now() - t0;
    db.prepare(
      'UPDATE sync_runs SET finished_at=?, members_seen=?, pauses=?, resumes=?, milestones=? WHERE id=?',
    ).run(new Date().toISOString(), members.length, pauses, resumes, milestones, runId);

    return { membersSeen: members.length, pauses, resumes, milestones, durationMs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.prepare('UPDATE sync_runs SET finished_at=?, error=? WHERE id=?').run(
      new Date().toISOString(),
      msg,
      runId,
    );
    throw err;
  }
}
