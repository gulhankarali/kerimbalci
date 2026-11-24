import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { api } from '../api';
import type { SeoOverview } from '../types';

// Same validated palette as Charts.tsx.
const C = {
  blue: '#2a78d6',
  aqua: '#1baf7a',
  yellow: '#eda100',
  grid: '#e1e0d9',
  axis: '#898781',
  ink: '#52514e',
};

const axisProps = { stroke: C.axis, fontSize: 12, tick: { fill: C.ink } };

const RANGES = [
  { days: 7, label: '7 gün' },
  { days: 28, label: '28 gün' },
  { days: 90, label: '3 ay' },
  { days: 480, label: '16 ay' },
];

const BRAND_RE = /kerim|balc[ıi]/i;

const fmt = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const pct = (n: number) => `%${(n * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
const pos = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

function shortDate(d: string): string {
  const dt = new Date(d + 'T00:00:00Z');
  return dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** One panel of the aligned small multiples (shared x-axis, synced crosshair). */
function DailyPanel({
  title,
  hero,
  data,
  dataKey,
  color,
  kind,
}: {
  title: string;
  hero: string;
  data: { label: string }[];
  dataKey: string;
  color: string;
  kind: 'line' | 'bar';
}) {
  const common = { data, syncId: 'seo-daily', margin: { top: 8, right: 20, bottom: 4, left: 0 } };
  const tooltip = <Tooltip formatter={(v: number) => [fmt(v), title]} labelStyle={{ color: C.ink }} />;
  return (
    <div className="chart-card">
      <h3>{title}</h3>
      <div className="chart-hero">{hero}</div>
      <ResponsiveContainer width="100%" height={150}>
        {kind === 'line' ? (
          <LineChart {...common}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" {...axisProps} minTickGap={24} />
            <YAxis {...axisProps} allowDecimals={false} width={40} />
            {tooltip}
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
          </LineChart>
        ) : (
          <BarChart {...common}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" {...axisProps} minTickGap={24} />
            <YAxis {...axisProps} allowDecimals={false} width={40} />
            {tooltip}
            <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function SeoCharts() {
  const [days, setDays] = useState(28);
  const [data, setData] = useState<SeoOverview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    api
      .seo(days)
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [days]);

  if (data && !data.configured) return null; // GSC not set up: hide the section

  const daily = (data?.daily || []).map((d) => ({ ...d, label: shortDate(d.date) }));
  const signupTotal = daily.reduce((a, d) => a + d.signups, 0);
  const topPages = (data?.pages || []).slice(0, 10);
  const maxClicks = Math.max(1, ...topPages.map((p) => p.clicks));
  const brandShare = data?.brand.reportedClicks ? data.brand.clicks / data.brand.reportedClicks : 0;

  return (
    <section className="charts seo">
      <div className="toolbar">
        <h2 className="section-title">Google arama (SEO)</h2>
        <div className="filters">
          {RANGES.map((r) => (
            <button
              key={r.days}
              className={`chip ${days === r.days ? 'chip--active' : ''}`}
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="error">⚠ Search Console verisi alınamadı: {err}</div>}
      {loading && !data && <p className="muted">Yükleniyor…</p>}

      {data && (
        <>
          <div className="cards">
            <div className="card">
              <div className="card__label">Tıklama</div>
              <div className="card__value">{fmt(data.totals.clicks)}</div>
              <div className="card__sub muted">Google'dan siteye gelen</div>
            </div>
            <div className="card">
              <div className="card__label">Gösterim</div>
              <div className="card__value">{fmt(data.totals.impressions)}</div>
              <div className="card__sub muted">arama sonuçlarında görünme</div>
            </div>
            <div className="card">
              <div className="card__label">Tıklama oranı</div>
              <div className="card__value">{pct(data.totals.ctr)}</div>
              <div className="card__sub muted">tıklama ÷ gösterim</div>
            </div>
            <div className="card">
              <div className="card__label">Ortalama sıra</div>
              <div className="card__value">{pos(data.totals.position)}</div>
              <div className="card__sub muted">1 = ilk sonuç</div>
            </div>
            <div className="card">
              <div className="card__label">Google'da görünen yazı</div>
              <div className="card__value">
                {data.posts.visible}
                <span className="card__of"> / {data.posts.published}</span>
              </div>
              <div className="card__sub muted">en az 1 gösterim alan</div>
            </div>
            <div className="card">
              <div className="card__label">Marka aramaları</div>
              <div className="card__value">{pct(brandShare)}</div>
              <div className="card__sub muted">"Kerim Balcı" içeren sorgular*</div>
            </div>
          </div>

          <p className="muted small chart-note">
            Arama trafiği ve yeni üyeler aynı gün ekseninde. Fareyle bir güne gelince üç grafikte de o gün
            işaretlenir.
          </p>
          <div className="charts-row charts-row--3">
            <DailyPanel title="Günlük tıklama" hero={fmt(data.totals.clicks)} data={daily} dataKey="clicks" color={C.blue} kind="line" />
            <DailyPanel title="Günlük gösterim" hero={fmt(data.totals.impressions)} data={daily} dataKey="impressions" color={C.aqua} kind="line" />
            <DailyPanel title="Yeni Ghost üyesi" hero={fmt(signupTotal)} data={daily} dataKey="signups" color={C.yellow} kind="bar" />
          </div>

          <div className="charts-row">
            <div className="chart-card">
              <h3>En çok tıklanan sayfalar</h3>
              <table className="seo-table">
                <thead>
                  <tr>
                    <th>Sayfa</th>
                    <th className="num">Tıklama</th>
                    <th className="num">Gösterim</th>
                    <th className="num">Oran</th>
                    <th className="num">Sıra</th>
                  </tr>
                </thead>
                <tbody>
                  {topPages.map((p) => (
                    <tr key={p.path}>
                      <td>
                        <a href={p.url} target="_blank" rel="noreferrer" title={p.url}>
                          {p.title}
                        </a>
                        <div className="seo-bar">
                          <div className="seo-bar__fill" style={{ width: `${(p.clicks / maxClicks) * 100}%` }} />
                        </div>
                      </td>
                      <td className="num strong">{fmt(p.clicks)}</td>
                      <td className="num">{fmt(p.impressions)}</td>
                      <td className="num">{pct(p.ctr)}</td>
                      <td className="num">{pos(p.position)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="chart-card">
              <h3>Arama sorguları</h3>
              <table className="seo-table">
                <thead>
                  <tr>
                    <th>Sorgu</th>
                    <th className="num">Tıklama</th>
                    <th className="num">Gösterim</th>
                    <th className="num">Sıra</th>
                  </tr>
                </thead>
                <tbody>
                  {data.queries.slice(0, 12).map((q) => (
                    <tr key={q.query}>
                      <td>
                        {q.query}
                        {BRAND_RE.test(q.query) && <span className="badge badge--brand">marka</span>}
                      </td>
                      <td className="num strong">{fmt(q.clicks)}</td>
                      <td className="num">{fmt(q.impressions)}</td>
                      <td className="num">{pos(q.position)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="muted small">
            * Google, nadir aranan sorguları gizlilik nedeniyle göstermez: bu dönemde {fmt(data.totals.clicks)} tıklamanın{' '}
            {fmt(data.brand.reportedClicks)} tanesinin sorgusu raporlandı; marka payı bunlar üzerinden hesaplandı.
            Search Console verisi 2–3 gün geriden gelir. Aralık: {shortDate(data.range.start)} – {shortDate(data.range.end)}.
          </p>
        </>
      )}
    </section>
  );
}
