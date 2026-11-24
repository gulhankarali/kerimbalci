import { Router } from 'express';
import { getDb } from '../db/db';
import { config } from '../config';
import { querySearchAnalytics, GscRow } from '../gsc/client';
import { fetchPublished } from '../ghost/client';

export const router = Router();

const DAY_MS = 24 * 60 * 60 * 1000;
const ALLOWED_DAYS = [7, 28, 90, 480]; // 480 ≈ the 16 months Search Console keeps
const CACHE_MS = 15 * 60 * 1000;

interface SeoMetric {
  clicks: number;
  impressions: number;
  ctr: number; // 0..1
  position: number; // impression-weighted average
}

interface SeoPage extends SeoMetric {
  path: string;
  url: string;
  title: string;
  isPost: boolean;
}

interface SeoOverview {
  range: { start: string; end: string; days: number };
  totals: SeoMetric;
  daily: { date: string; clicks: number; impressions: number; signups: number }[];
  pages: SeoPage[];
  queries: (SeoMetric & { query: string })[];
  posts: { published: number; visible: number };
  // Clicks/impressions from queries naming the author or site. Google hides rare
  // (anonymised) queries, so this covers only the queries it reports.
  brand: { clicks: number; impressions: number; reportedClicks: number; reportedImpressions: number };
}

const BRAND_RE = /kerim|balc[ıi]/i;

const cache = new Map<number, { at: number; data: SeoOverview }>();

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Path part of a URL, normalised so http/https/www variants merge. */
function pathOf(url: string): string {
  try {
    const p = new URL(url).pathname;
    const withSlash = p.endsWith('/') ? p : p + '/';
    // Paginated listings (/page/2/, /author/x/page/3/) count as their first page.
    return withSlash.replace(/page\/\d+\/$/, '');
  } catch {
    return url;
  }
}

function staticTitle(path: string): string | null {
  if (path === '/') return 'Ana sayfa';
  if (path.startsWith('/author/')) return `Yazar: ${decodeURIComponent(path.split('/')[2] || '')}`;
  if (path.startsWith('/tag/')) return `Etiket: ${decodeURIComponent(path.split('/')[2] || '')}`;
  return null;
}

function metric(r: Pick<GscRow, 'clicks' | 'impressions' | 'ctr' | 'position'>): SeoMetric {
  return { clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position };
}

async function buildOverview(days: number): Promise<SeoOverview> {
  const endMs = Date.now();
  const startMs = endMs - (days - 1) * DAY_MS;
  const startDate = isoDay(startMs);
  const endDate = isoDay(endMs);
  const q = { startDate, endDate };

  const [totalRows, dateRows, pageRows, queryRows, posts, ghostPages] = await Promise.all([
    querySearchAnalytics({ ...q, dimensions: [] }),
    querySearchAnalytics({ ...q, dimensions: ['date'] }),
    querySearchAnalytics({ ...q, dimensions: ['page'], rowLimit: 500 }),
    querySearchAnalytics({ ...q, dimensions: ['query'], rowLimit: 1000 }),
    fetchPublished('posts'),
    fetchPublished('pages'),
  ]);

  // New Ghost members per GMT day (from the synced members table).
  const signupRows = getDb()
    .prepare(
      `SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS n FROM members
       WHERE substr(created_at, 1, 10) BETWEEN ? AND ? GROUP BY date`,
    )
    .all(startDate, endDate) as { date: string; n: number }[];
  const signups = new Map(signupRows.map((r) => [r.date, r.n]));
  const byDate = new Map(dateRows.map((r) => [r.keys![0], r]));

  // Continuous day axis so search and signups line up, zero-filled. Start at the
  // first day Search Console has data, so days before tracking don't read as zero.
  const firstGscDay = dateRows.map((r) => r.keys![0]).sort()[0];
  const axisStart = firstGscDay && firstGscDay > startDate ? firstGscDay : startDate;
  const daily: SeoOverview['daily'] = [];
  for (let ms = Date.parse(axisStart); ms <= Date.parse(endDate); ms += DAY_MS) {
    const date = isoDay(ms);
    const r = byDate.get(date);
    daily.push({ date, clicks: r?.clicks ?? 0, impressions: r?.impressions ?? 0, signups: signups.get(date) ?? 0 });
  }

  // Merge page rows by path, then label with the Ghost post title where possible.
  const postByPath = new Map(posts.map((p) => [pathOf(p.url), p]));
  const ghostPageByPath = new Map(ghostPages.map((p) => [pathOf(p.url), p]));
  const merged = new Map<string, { url: string; clicks: number; impressions: number; posSum: number }>();
  for (const r of pageRows) {
    const url = r.keys![0];
    const path = pathOf(url);
    const m = merged.get(path) || { url, clicks: 0, impressions: 0, posSum: 0 };
    m.clicks += r.clicks;
    m.impressions += r.impressions;
    m.posSum += r.position * r.impressions;
    merged.set(path, m);
  }
  const pages: SeoPage[] = [...merged.entries()]
    .map(([path, m]) => {
      const post = postByPath.get(path);
      const ghostPage = ghostPageByPath.get(path);
      return {
        path,
        url: post?.url || m.url,
        title: post?.title || ghostPage?.title || staticTitle(path) || decodeURIComponent(path),
        isPost: !!post,
        clicks: m.clicks,
        impressions: m.impressions,
        ctr: m.impressions ? m.clicks / m.impressions : 0,
        position: m.impressions ? m.posSum / m.impressions : 0,
      };
    })
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);

  const brand = { clicks: 0, impressions: 0, reportedClicks: 0, reportedImpressions: 0 };
  for (const r of queryRows) {
    brand.reportedClicks += r.clicks;
    brand.reportedImpressions += r.impressions;
    if (BRAND_RE.test(r.keys![0])) {
      brand.clicks += r.clicks;
      brand.impressions += r.impressions;
    }
  }

  const totals = totalRows[0] ? metric(totalRows[0]) : { clicks: 0, impressions: 0, ctr: 0, position: 0 };

  return {
    range: { start: axisStart, end: endDate, days },
    totals,
    daily,
    pages,
    queries: queryRows.slice(0, 25).map((r) => ({ query: r.keys![0], ...metric(r) })),
    posts: { published: posts.length, visible: pages.filter((p) => p.isPost && p.impressions > 0).length },
    brand,
  };
}

// GET /api/seo/overview?days=28 — Search Console + Ghost combined view
router.get('/seo/overview', async (req, res) => {
  if (!config.gsc.keyFile || !config.gsc.siteUrl) {
    return res.json({ configured: false });
  }
  const requested = Number(req.query.days);
  const days = ALLOWED_DAYS.includes(requested) ? requested : 28;
  const hit = cache.get(days);
  if (hit && Date.now() - hit.at < CACHE_MS) return res.json({ configured: true, ...hit.data });
  try {
    const data = await buildOverview(days);
    cache.set(days, { at: Date.now(), data });
    res.json({ configured: true, ...data });
  } catch (err) {
    res.status(502).json({ configured: true, error: err instanceof Error ? err.message : String(err) });
  }
});
