import { useEffect, useState, useCallback } from 'react';
import { api } from './api';
import type { Member, Stats } from './types';
import { StatCards } from './components/StatCards';
import { MembersTable } from './components/MembersTable';
import { Charts } from './components/Charts';
import { SeoCharts } from './components/SeoCharts';
import { STATE_LABELS } from './utils';

const FILTERS = ['all', 'active', 'in_trial', 'past_due', 'paused', 'completed', 'comped', 'free'];

export function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [milestoneMonths, setMilestoneMonths] = useState(12);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0); // bump to refresh charts

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, m] = await Promise.all([
        api.stats(),
        api.members({ state: filter === 'all' ? undefined : filter, sort: 'accrued', order: 'desc' }),
      ]);
      setStats(s);
      setMembers(m.members);
      setMilestoneMonths(m.milestoneMonths);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      const r = await api.sync();
      if (!r.ok) throw new Error(r.error || 'sync failed');
      await load();
      setReloadToken((t) => t + 1); // refresh charts after sync
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Subscriber Book Tracker</h1>
          <p className="muted">kerimbalci.com — customers by subscription age</p>
        </div>
        <button className="btn" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync from Ghost'}
        </button>
      </header>

      {error && <div className="error">⚠ {error}</div>}

      {stats && <StatCards stats={stats} />}

      <Charts key={reloadToken} />

      <SeoCharts key={`seo-${reloadToken}`} />

      {stats && stats.dueForBook.length > 0 && (
        <div className="due-panel">
          <h2>📚 Ready to receive the book</h2>
          <ul>
            {stats.dueForBook.map((d) => (
              <li key={d.id}>
                <strong>{d.name || d.email}</strong> — {d.accrued_months.toFixed(1)} months paid
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats && stats.dueForCoupon.length > 0 && (
        <div className="due-panel">
          <h2>🎟️ Earned the 50% coupon (Bronz)</h2>
          <ul>
            {stats.dueForCoupon.map((d) => (
              <li key={d.id}>
                <strong>{d.name || d.email}</strong> — {d.accrued_months.toFixed(1)} months paid
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="toolbar">
        <div className="filters">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`chip ${filter === f ? 'chip--active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : STATE_LABELS[f] || f}
            </button>
          ))}
        </div>
        {stats?.lastSync?.finished_at && (
          <span className="muted small">
            Last sync: {new Date(stats.lastSync.finished_at).toLocaleString()} ·{' '}
            {stats.lastSync.members_seen} members
          </span>
        )}
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <MembersTable members={members} milestoneMonths={milestoneMonths} />
      )}

      <footer className="footer muted small">
        Subscription age = cumulative paid time (7-day trial excluded, pauses on
        cancel/refund/failed payment). Book milestone: {milestoneMonths} months.
      </footer>
    </div>
  );
}
