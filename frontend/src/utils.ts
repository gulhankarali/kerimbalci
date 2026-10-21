/** Format accrued months as "Xm Yd" style, e.g. 0.675 -> "20d", 13.5 -> "13.5mo". */
export function formatAge(months: number): string {
  if (months <= 0) return '—';
  if (months < 1) {
    const days = Math.round(months * (365.25 / 12));
    return `${days}d`;
  }
  return `${months.toFixed(1)}mo`;
}

export const STATE_LABELS: Record<string, string> = {
  active: 'Active (paying)',
  in_trial: 'In trial',
  paused: 'Paused',
  comped: 'Comped',
  free: 'Free',
  completed: 'Completed',
};

export const STATE_ORDER = ['completed', 'active', 'paused', 'in_trial', 'comped', 'free'];

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
