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
  const sql = `SELECT id, email, name, status, tier, sub_status, interval, trial_end_at,
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
  const due = db
    .prepare(
      `SELECT id, name, email, accrued_months FROM members
       WHERE accrued_months >= ? AND book_sent = 0
       ORDER BY accrued_months DESC`,
    )
    .all(config.milestoneMonths);
  const lastSync = db
    .prepare('SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1')
    .get();
  res.json({ total: total.n, byState, dueForBook: due, milestoneMonths: config.milestoneMonths, lastSync });
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
