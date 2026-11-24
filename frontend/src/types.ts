export interface Member {
  id: string;
  email: string;
  name: string | null;
  status: string;
  tier: string | null;
  sub_status: string | null;
  interval: string | null;
  trial_end_at: string | null;
  accrued_days: number;
  accrued_months: number;
  current_state: string;
  book_sent: number;
  book_sent_at: string | null;
  last_synced_at: string | null;
}

export interface StateCount {
  state: string;
  n: number;
}

export interface DueMember {
  id: string;
  name: string | null;
  email: string;
  accrued_months: number;
}

export interface SyncRun {
  id: number;
  started_at: string | null;
  finished_at: string | null;
  members_seen: number | null;
  pauses: number | null;
  resumes: number | null;
  milestones: number | null;
  error: string | null;
}

export interface Revenue {
  mrr: number;
  arr: number;
  currency: string;
  subscriberCount: number;
}

export interface Snapshot {
  date: string;
  total: number;
  free_count: number;
  silver_count: number;
  gold_count: number;
  bronz_count: number | null;
  active_count: number;
  mrr: number;
  arr: number;
}

export interface RegionCount {
  region: string;
  n: number;
}

export interface Stats {
  total: number;
  byState: StateCount[];
  byTier: Record<string, number>;
  revenue: Revenue;
  dueForBook: DueMember[];
  dueForCoupon: DueMember[];
  milestoneMonths: number;
  lastSync: SyncRun | null;
}
