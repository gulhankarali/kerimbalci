import { GhostMember, GhostSubscription } from '../ghost/client';
import { DAYS_PER_MONTH } from '../config';

// Stripe subscription statuses we treat as "actively paying" (accruing time).
const PAYING_STATUSES = new Set(['active']);
// Statuses that mean the member is in the free trial (not yet paying).
const TRIAL_STATUSES = new Set(['trialing']);

export interface MemberClassification {
  subStatus: string | null; // latest subscription status
  isPaying: boolean; // currently accruing paid time
  isTrialing: boolean;
  trialEndAt: string | null; // when the paid clock starts
  // Canceled in Ghost but Stripe keeps it `active` until the period ends.
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  interval: string | null; // month | year
  tier: string | null;
  planAmount: number | null; // subscription price in minor units (cents)
  currency: string | null;
}

/**
 * Pick the most relevant subscription for a member: prefer `current_subscription`,
 * else the most recently started entry in `subscriptions`.
 */
export function primarySubscription(member: GhostMember): GhostSubscription | null {
  if (member.current_subscription) return member.current_subscription;
  const subs = member.subscriptions || [];
  if (subs.length === 0) return null;
  return [...subs].sort((a, b) => {
    const ta = a.start_date ? Date.parse(a.start_date) : 0;
    const tb = b.start_date ? Date.parse(b.start_date) : 0;
    return tb - ta;
  })[0];
}

export function classifyMember(member: GhostMember): MemberClassification {
  const sub = primarySubscription(member);
  const subStatus = sub?.status ?? null;
  // Comped (gifted) members never pay real money, so they do not accrue paid
  // time toward the book reward, even if they carry an active subscription.
  const comped = member.comped || member.status === 'comped';
  return {
    subStatus,
    isPaying: !comped && subStatus != null && PAYING_STATUSES.has(subStatus),
    isTrialing: subStatus != null && TRIAL_STATUSES.has(subStatus),
    trialEndAt: sub?.trial_end_at ?? null,
    cancelAtPeriodEnd: !!sub?.cancel_at_period_end,
    currentPeriodEnd: sub?.current_period_end ?? null,
    interval: sub?.plan?.interval ?? null,
    tier: sub?.tier?.name ?? member.tiers?.[0]?.name ?? null,
    planAmount: sub?.plan?.amount ?? null,
    currency: sub?.plan?.currency ?? null,
  };
}

/**
 * Derive the display state for a member given its classification and accrued time.
 * `completed` overrides everything once the milestone is reached.
 */
export function deriveState(
  member: GhostMember,
  cls: MemberClassification,
  accruedMonths: number,
  milestoneMonths: number,
): string {
  if (accruedMonths >= milestoneMonths) return 'completed';
  if (member.comped || member.status === 'comped') return 'comped';
  // Still paid up (time keeps accruing) but will not renew.
  if ((cls.isPaying || cls.isTrialing) && cls.cancelAtPeriodEnd) return 'canceling';
  if (cls.isPaying) return 'active';
  if (cls.isTrialing) return 'in_trial';
  if (cls.subStatus) return 'paused'; // canceled / past_due / unpaid / etc.
  return 'free';
}

export function daysToMonths(days: number): number {
  return days / DAYS_PER_MONTH;
}

export function monthsToDays(months: number): number {
  return months * DAYS_PER_MONTH;
}

/** Duration in days between two ISO timestamps (b defaults to now). */
export function daysBetween(aIso: string, bIso?: string): number {
  const a = Date.parse(aIso);
  const b = bIso ? Date.parse(bIso) : Date.now();
  return Math.max(0, (b - a) / (1000 * 60 * 60 * 24));
}
