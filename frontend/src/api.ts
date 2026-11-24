import type { Member, Stats, Snapshot, RegionCount, SeoOverview } from './types';

// Same-origin /api paths; Vite dev server proxies them to the backend.
async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

async function post<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: 'POST' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const api = {
  stats: () => get<Stats>('/api/stats'),
  members: (params: { state?: string; sort?: string; order?: string }) => {
    const qs = new URLSearchParams();
    if (params.state) qs.set('state', params.state);
    if (params.sort) qs.set('sort', params.sort);
    if (params.order) qs.set('order', params.order);
    return get<{ members: Member[]; milestoneMonths: number }>(`/api/members?${qs.toString()}`);
  },
  sync: () => post<{ ok: boolean; result?: unknown; error?: string }>('/api/sync'),
  timeseries: () => get<{ snapshots: Snapshot[] }>('/api/metrics/timeseries'),
  regions: () => get<{ regions: RegionCount[] }>('/api/metrics/regions'),
  seo: (days: number) => get<SeoOverview>(`/api/seo/overview?days=${days}`),
};
