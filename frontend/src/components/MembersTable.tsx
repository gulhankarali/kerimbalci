import type { Member } from '../types';
import { formatAge, formatDate, STATE_LABELS } from '../utils';

interface Props {
  members: Member[];
  milestoneMonths: number;
}

function StateBadge({ state }: { state: string }) {
  return <span className={`badge badge--${state}`}>{STATE_LABELS[state] || state}</span>;
}

function ProgressBar({ months, milestone }: { months: number; milestone: number }) {
  const pct = Math.min(100, (months / milestone) * 100);
  return (
    <div className="progress" title={`${months.toFixed(2)} / ${milestone} months`}>
      <div className="progress__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function MembersTable({ members, milestoneMonths }: Props) {
  if (members.length === 0) {
    return <p className="muted">No members match this filter.</p>;
  }
  return (
    <table className="members">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Tier</th>
          <th>Plan</th>
          <th>State</th>
          <th className="num">Subscription age</th>
          <th className="progress-col">Progress to book</th>
          <th>Paid since</th>
        </tr>
      </thead>
      <tbody>
        {members.map((m) => (
          <tr key={m.id}>
            <td>{m.name || <span className="muted">—</span>}</td>
            <td className="muted">{m.email}</td>
            <td>{m.tier || '—'}</td>
            <td>{m.interval || '—'}</td>
            <td>
              <StateBadge state={m.current_state} />
            </td>
            <td className="num strong">{formatAge(m.accrued_months)}</td>
            <td className="progress-col">
              <ProgressBar months={m.accrued_months} milestone={milestoneMonths} />
            </td>
            <td className="muted">{formatDate(m.trial_end_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
