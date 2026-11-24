import crypto from 'crypto';
import fs from 'fs';
import { config } from '../config';

// --- Google Search Console (Search Analytics) client ---
// Auth: service-account JWT (RS256) exchanged for a short-lived OAuth token.

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface GscRow {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export type GscDimension = 'date' | 'page' | 'query' | 'country' | 'device';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

let _key: ServiceAccountKey | null = null;
function loadKey(): ServiceAccountKey {
  if (_key) return _key;
  if (!config.gsc.keyFile) throw new Error('GSC_KEY_FILE is not set (see .env.example)');
  _key = JSON.parse(fs.readFileSync(config.gsc.keyFile, 'utf8')) as ServiceAccountKey;
  return _key;
}

let _token: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (_token && _token.expiresAt > Date.now() + 60_000) return _token.value;
  const key = loadKey();
  const tokenUri = key.token_uri || 'https://oauth2.googleapis.com/token';
  const iat = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iss: key.client_email, scope: SCOPE, aud: tokenUri, iat, exp: iat + 3600 };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(key.private_key);
  const assertion = `${unsigned}.${base64url(signature)}`;

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  _token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return _token.value;
}

/** Run a Search Analytics query. Dates are YYYY-MM-DD (Pacific time, per Google). */
export async function querySearchAnalytics(opts: {
  startDate: string;
  endDate: string;
  dimensions: GscDimension[];
  rowLimit?: number;
}): Promise<GscRow[]> {
  const token = await getAccessToken();
  const site = encodeURIComponent(config.gsc.siteUrl);
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate: opts.startDate,
      endDate: opts.endDate,
      dimensions: opts.dimensions,
      rowLimit: opts.rowLimit ?? 1000,
      dataState: 'all', // include fresh (not yet finalised) data
    }),
  });
  if (!res.ok) throw new Error(`Search Console API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { rows?: GscRow[] };
  return data.rows || [];
}
