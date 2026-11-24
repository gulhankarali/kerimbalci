import crypto from 'crypto';
import { config } from '../config';

// --- Ghost Admin API types (only the fields we use) ---

export interface GhostSubscription {
  id: string;
  status: string; // trialing | active | past_due | canceled | unpaid | incomplete | ...
  start_date: string | null;
  current_period_end: string | null;
  trial_start_at: string | null;
  trial_end_at: string | null;
  cancel_at_period_end: boolean;
  cancellation_reason: string | null;
  plan?: { nickname: string | null; amount: number; interval: string; currency: string } | null;
  tier?: { name: string; slug: string; trial_days: number } | null;
}

export interface GhostMember {
  id: string;
  email: string;
  name: string | null;
  status: string; // free | paid | comped
  comped: boolean;
  created_at: string;
  updated_at: string;
  geolocation: string | null; // JSON string: {"country","country_code","region"}
  subscriptions: GhostSubscription[];
  current_subscription?: GhostSubscription | null;
  tiers?: { name: string; slug: string }[];
  labels?: { name: string; slug: string }[];
}

interface MembersResponse {
  members: GhostMember[];
  meta?: { pagination?: { total: number; pages: number; page: number; next: number | null } };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Build a short-lived JWT for the Ghost Admin API, signed with the key secret
 * (HMAC-SHA256). The key id becomes the JWT `kid` header.
 */
function makeAdminToken(adminKey: string): string {
  const [id, secret] = adminKey.split(':');
  if (!id || !secret) throw new Error('GHOST_ADMIN_API_KEY must be in "id:secret" form');

  const header = { alg: 'HS256', typ: 'JWT', kid: id };
  const iat = Math.floor(Date.now() / 1000);
  const payload = { iat, exp: iat + 300, aud: '/admin/' };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest();
  return `${unsigned}.${base64url(signature)}`;
}

async function adminGet<T>(path: string): Promise<T> {
  const token = makeAdminToken(config.ghost.adminKey);
  const url = `${config.ghost.url}/ghost/api/admin${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0' },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ghost Admin API ${res.status} for ${path}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/**
 * Fetch every member, paging through the Admin API, with subscriptions/tiers/labels
 * included. The site is small (~134 members) so eager full fetch is fine.
 */
export async function fetchAllMembers(): Promise<GhostMember[]> {
  const out: GhostMember[] = [];
  const limit = 100;
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const qs = `?limit=${limit}&page=${page}&include=${encodeURIComponent('subscriptions,tiers,labels')}`;
    const data = await adminGet<MembersResponse>(`/members/${qs}`);
    out.push(...data.members);
    const next = data.meta?.pagination?.next;
    if (!next) break;
    page = next;
  }
  return out;
}

export interface GhostPost {
  id: string;
  title: string;
  url: string;
  published_at: string | null;
}

/** Fetch every published post or page (title + canonical URL), used to label SEO pages. */
export async function fetchPublished(kind: 'posts' | 'pages'): Promise<GhostPost[]> {
  const out: GhostPost[] = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const qs = `?limit=100&page=${page}&filter=${encodeURIComponent('status:published')}&fields=id,title,url,published_at`;
    const data = await adminGet<Record<string, GhostPost[]> & { meta?: MembersResponse['meta'] }>(`/${kind}/${qs}`);
    out.push(...(data[kind] as GhostPost[]));
    const next = data.meta?.pagination?.next;
    if (!next) break;
    page = next;
  }
  return out;
}
