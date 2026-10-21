import type { Stats } from '../types';
import { STATE_LABELS, STATE_ORDER } from '../utils';

export function StatCards({ stats }: { stats: Stats }) {
  const counts: Record<string, number> = {};
  for (const s of stats.byState) counts[s.state] = s.n;

  return (
    <div className="cards">
      <div className="card card--accent">
        <div className="card__label">Due to send the book</div>
        <div className="card__value">{stats.dueForBook.length}</div>
        <div className="card__sub">≥ {stats.milestoneMonths} months paid</div>
      </div>
      <div className="card">
        <div className="card__label">Total members</div>
        <div className="card__value">{stats.total}</div>
      </div>
      {STATE_ORDER.filter((s) => counts[s]).map((s) => (
        <div className="card" key={s}>
          <div className="card__label">{STATE_LABELS[s] || s}</div>
          <div className="card__value">{counts[s]}</div>
        </div>
      ))}
    </div>
  );
}
