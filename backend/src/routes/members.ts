import { Router } from 'express';
import { getDb } from '../db/db';
import { runSync } from '../services/sync';
import { config } from '../config';

export const router = Router();

const SORT_COLUMNS: Record<string, string> = {
  accrued: 'accrued_months',
  name: 'name',
  created: 'created_at',
  state: 'current_state',
};

// GET /api/members?state=active&sort=accrued&order=desc
router.get('/members', (req, res) => {
  const db = getDb();
  const state = typeof req.query.state === 'string' ? req.query.state : undefined;
  const sortKey = typeof req.query.sort === 'string' ? req.query.sort : 'accrued';
  const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
  const sortCol = SORT_COLUMNS[sortKey] || 'accrued_months';

  const where: string[] = [];
  const params: unknown[] = [];
  if (state) {
    where.push('current_state = ?');
    params.push(state);
  }
  const sql = `SELECT id, email, name, status, tier, sub_status, interval, trial_end_at, current_period_end,
      accrued_days, accrued_months, current_state, book_sent, book_sent_at, last_synced_at
      FROM members
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY ${sortCol} ${order}`;
  const rows = db.prepare(sql).all(...params);
  res.json({ members: rows, milestoneMonths: config.milestoneMonths });
});

// GET /api/members/:id — member detail with paid periods and events
router.get('/members/:id', (req, res) => {
  const db = getDb();
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'member not found' });
  const periods = db
    .prepare('SELECT * FROM paid_periods WHERE member_id = ? ORDER BY period_start')
    .all(req.params.id);
  const events = db
    .prepare('SELECT * FROM events WHERE member_id = ? ORDER BY detected_at DESC')
    .all(req.params.id);
  res.json({ member, periods, events });
});

// GET /api/stats — dashboard summary + who is due to be sent the book
router.get('/stats', (_req, res) => {
  const db = getDb();
  const byState = db
    .prepare('SELECT current_state AS state, COUNT(*) AS n FROM members GROUP BY current_state')
    .all();
  const total = db.prepare('SELECT COUNT(*) AS n FROM members').get() as { n: number };
  // Bronz members earn a 50%-off coupon at the milestone instead of a book.
  const due = db
    .prepare(
      `SELECT id, name, email, accrued_months FROM members
       WHERE accrued_months >= ? AND book_sent = 0 AND COALESCE(tier, '') <> 'Bronz'
       ORDER BY accrued_months DESC`,
    )
    .all(config.milestoneMonths);
  const couponDue = db
    .prepare(
      `SELECT id, name, email, accrued_months FROM members
       WHERE accrued_months >= ? AND book_sent = 0 AND tier = 'Bronz'
       ORDER BY accrued_months DESC`,
    )
    .all(config.milestoneMonths);
  const lastSync = db
    .prepare('SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1')
    .get();

  // Subscriber base = anyone with a live subscription (active or trialing),
  // excluding comped (gifted) members, whose Ghost "Complimentary" sub is not revenue.
  // Revenue counts trialing members too ("regardless of trialing"), but not
  // members who canceled and are only running out their paid period.
  const liveRows = db
    .prepare(
      `SELECT tier, interval, plan_amount, currency, cancel_at_period_end
       FROM members
       WHERE sub_status IN ('active', 'trialing') AND comped = 0 AND status <> 'comped'`,
    )
    .all() as {
    tier: string | null;
    interval: string | null;
    plan_amount: number | null;
    currency: string | null;
    cancel_at_period_end: number | null;
  }[];

  // Tier counts still include canceling members: they hold the tier until the period ends.
  const byTier: Record<string, number> = {};
  for (const r of liveRows) {
    const tier = r.tier || 'Unknown';
    byTier[tier] = (byTier[tier] || 0) + 1;
  }

  const subscriberRows = liveRows.filter((r) => !r.cancel_at_period_end);
  let mrrCents = 0;
  const currencies = new Set<string>();
  for (const r of subscriberRows) {
    if (r.plan_amount) {
      // Normalise any plan to a monthly figure.
      const monthly = r.interval === 'year' ? r.plan_amount / 12 : r.plan_amount;
      mrrCents += monthly;
      if (r.currency) currencies.add(r.currency.toUpperCase());
    }
  }
  const mrr = mrrCents / 100;
  const revenue = {
    mrr,
    arr: mrr * 12,
    currency: currencies.size === 1 ? [...currencies][0] : currencies.size === 0 ? 'USD' : 'MIXED',
    subscriberCount: subscriberRows.length,
    cancelingCount: liveRows.length - subscriberRows.length,
  };

  res.json({
    total: total.n,
    byState,
    byTier,
    revenue,
    dueForBook: due,
    dueForCoupon: couponDue,
    milestoneMonths: config.milestoneMonths,
    lastSync,
  });
});

// GET /api/metrics/timeseries — daily snapshots for the trend charts
router.get('/metrics/timeseries', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT date, total, free_count, silver_count, gold_count, bronz_count, active_count, mrr, arr
       FROM metrics_snapshots ORDER BY date ASC`,
    )
    .all();
  res.json({ snapshots: rows });
});

// GET /api/metrics/regions — current member distribution by region
router.get('/metrics/regions', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT COALESCE(region, 'Other') AS region, COUNT(*) AS n
       FROM members GROUP BY COALESCE(region, 'Other')`,
    )
    .all() as { region: string; n: number }[];
  // Stable order: USA, EU, UK, Other.
  const order = ['USA', 'EU', 'UK', 'Other'];
  const map: Record<string, number> = {};
  for (const r of rows) map[r.region] = r.n;
  const regions = order.map((region) => ({ region, n: map[region] || 0 }));
  res.json({ regions });
});

// POST /api/sync — trigger a sync on demand (the daily cron will call runSync too)
router.post('/sync', async (_req, res) => {
  try {
    const result = await runSync();
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
