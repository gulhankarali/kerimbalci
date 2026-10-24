import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { api } from '../api';
import type { Snapshot, RegionCount } from '../types';
import { formatMoney } from '../utils';

// Validated categorical palette (dataviz skill, light mode).
const C = {
  blue: '#2a78d6',
  green: '#008300',
  magenta: '#e87ba4',
  yellow: '#eda100',
  aqua: '#1baf7a',
  grid: '#e1e0d9',
  axis: '#898781',
  ink: '#52514e',
};

const TIER_COLORS = { free: C.blue, silver: C.aqua, gold: C.yellow };
const REGION_COLORS: Record<string, string> = {
  USA: C.blue,
  EU: C.green,
  UK: C.magenta,
  Other: C.yellow,
};

const axisProps = { stroke: C.axis, fontSize: 12, tick: { fill: C.ink } };

function shortDate(d: string): string {
  // YYYY-MM-DD -> "24 Oct"
  const dt = new Date(d + 'T00:00:00Z');
  return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function Charts() {
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [regions, setRegions] = useState<RegionCount[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.timeseries(), api.regions()])
      .then(([t, r]) => {
        setSnaps(t.snapshots);
        setRegions(r.regions);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  if (err) return <div className="error">⚠ Grafik verisi alınamadı: {err}</div>;

  const data = snaps.map((s) => ({ ...s, label: shortDate(s.date) }));
  const latest = data[data.length - 1];
  const onePoint = data.length < 2;
  const regionTotal = regions.reduce((a, r) => a + r.n, 0);

  return (
    <div className="charts">
      {onePoint && (
        <p className="muted small chart-note">
          📈 Trend grafikleri her günkü sync ile dolar — şu an {data.length} günlük veri var.
        </p>
      )}

      {/* 1) Member growth by tier */}
      <div className="chart-card chart-card--wide">
        <h3>Üye sayısı — tier bazında artış</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 8, right: 24, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="free_count" name="Free" stroke={TIER_COLORS.free} strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="silver_count" name="Silver" stroke={TIER_COLORS.silver} strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="gold_count" name="Gold" stroke={TIER_COLORS.gold} strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="charts-row">
        {/* 2a) MRR trend */}
        <div className="chart-card">
          <h3>MRR · aylık yinelenen gelir</h3>
          {latest && <div className="chart-hero">{formatMoney(latest.mrr, 'USD')}</div>}
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ top: 8, right: 20, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} />
              <Tooltip />
              <Line type="monotone" dataKey="mrr" name="MRR" stroke={C.blue} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 2b) ARR trend */}
        <div className="chart-card">
          <h3>ARR · yıllık yinelenen gelir</h3>
          {latest && <div className="chart-hero">{formatMoney(latest.arr, 'USD')}</div>}
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ top: 8, right: 20, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} />
              <Tooltip />
              <Line type="monotone" dataKey="arr" name="ARR" stroke={C.green} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3) Region distribution */}
      <div className="chart-card">
        <h3>Bölgelere göre üye dağılımı</h3>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={regions}
              dataKey="n"
              nameKey="region"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={95}
              paddingAngle={2}
              label={({ name, value }) =>
                `${name}: ${value} (${regionTotal ? Math.round((value / regionTotal) * 100) : 0}%)`
              }
            >
              {regions.map((r) => (
                <Cell key={r.region} fill={REGION_COLORS[r.region] || C.yellow} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
