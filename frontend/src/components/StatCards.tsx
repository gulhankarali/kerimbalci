import type { Stats } from '../types';
import { STATE_LABELS, STATE_ORDER, formatMoney } from '../utils';

export function StatCards({ stats }: { stats: Stats }) {
  const counts: Record<string, number> = {};
  for (const s of stats.byState) counts[s.state] = s.n;
  const { revenue, byTier } = stats;

  return (
    <>
      {/* Revenue + subscriber-base row */}
      <div className="cards">
        <div className="card card--revenue">
          <div className="card__label">MRR · aylık yinelenen gelir</div>
          <div className="card__value">{formatMoney(revenue.mrr, revenue.currency)}</div>
          <div className="card__sub">{revenue.subscriberCount} abone (trial dahil)</div>
        </div>
        <div className="card card--revenue">
          <div className="card__label">ARR · yıllık yinelenen gelir</div>
          <div className="card__value">{formatMoney(revenue.arr, revenue.currency)}</div>
          <div className="card__sub">MRR × 12</div>
        </div>
        <div className="card card--gold">
          <div className="card__label">Gold üye</div>
          <div className="card__value">{byTier['Gold'] || 0}</div>
          <div className="card__sub">yıl sonunda 2 kitap</div>
        </div>
        <div className="card card--silver">
          <div className="card__label">Silver üye</div>
          <div className="card__value">{byTier['Silver'] || 0}</div>
          <div className="card__sub">yılda 1 kitap seçer</div>
        </div>
        <div className="card card--bronz">
          <div className="card__label">Bronz üye</div>
          <div className="card__value">{byTier['Bronz'] || 0}</div>
          <div className="card__sub">bir kitapta %50 indirim kuponu</div>
        </div>
      </div>

      {/* Milestone + membership-state row */}
      <div className="cards">
        <div className="card card--accent">
          <div className="card__label">Kitaba hazır</div>
          <div className="card__value">{stats.dueForBook.length}</div>
          <div className="card__sub">≥ {stats.milestoneMonths} ay ödeme</div>
        </div>
        <div className="card">
          <div className="card__label">Toplam üye</div>
          <div className="card__value">{stats.total}</div>
        </div>
        {STATE_ORDER.filter((s) => counts[s]).map((s) => (
          <div className="card" key={s}>
            <div className="card__label">{STATE_LABELS[s] || s}</div>
            <div className="card__value">{counts[s]}</div>
          </div>
        ))}
      </div>
    </>
  );
}
