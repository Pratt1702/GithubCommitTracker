import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { StudentStats, TrendPoint } from '../../shared/types';
import { AXIS_TICK, tooltipStyles, useChartInk } from '../hooks/useChartInk';
import { fmt } from './ui';

interface Props {
  trend: TrendPoint[];
  stats: StudentStats[];
  granularity: string;
}

export default function Charts({ trend, stats, granularity }: Props) {
  const ink = useChartInk();
  const tip = tooltipStyles(ink);

  // Bars read better for coarse buckets and short series; an area for long dailies.
  const useBars = granularity !== 'day' || trend.length <= 35;

  // "Most active" leaderboard. Cap at 10; if a name's first token is a single
  // letter (e.g. "M Karthi"), drop it so the chart doesn't show a bare initial.
  const MAX_LEADERS = 10;
  const leaders = [...stats]
    .filter((s) => s.windowTotal > 0)
    .sort((a, b) => b.windowTotal - a.windowTotal)
    .slice(0, MAX_LEADERS)
    .map((s) => {
      const parts = s.name.trim().split(/\s+/);
      const label = parts.length > 1 && parts[0].length === 1 ? parts.slice(1).join(' ') : parts[0] || s.username;
      return { id: s.id, name: s.name, label, dept: s.dept, total: s.windowTotal };
    });

  // Custom label formatter: truncate with an ellipsis so long names never
  // overflow the axis. The full name + dept still surface in the hover tooltip.
  const renderName = (value: string): string => {
    const MAX = 9;
    return value.length > MAX ? `${value.slice(0, MAX - 1)}…` : value;
  };

  const leaderTip = (props: any) => {
    if (!props?.active || !props.payload?.length) return null;
    const d = props.payload[0].payload as { name: string; dept: string; total: number };
    return (
      <div
        style={{
          background: ink.panel,
          border: `1px solid ${ink.line}`,
          borderRadius: 5,
          padding: '6px 9px',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
          color: ink.fg,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 2 }}>{d.name}</div>
        <div style={{ color: ink.axis }}>{d.dept || '—'}</div>
        <div style={{ marginTop: 2 }}>
          {fmt(d.total)} <span style={{ color: ink.axis }}>commits</span>
        </div>
      </div>
    );
  };

  return (
    <div className="chart-grid">
      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="label">Contribution trend</div>
            <div className="dimmer" style={{ fontSize: 'var(--fs-sm)' }}>
              {trend.length} {granularity} buckets · whole cohort
            </div>
          </div>
        </div>

        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%">
            {useBars ? (
              <BarChart data={trend} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={ink.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ ...AXIS_TICK, fill: ink.axis }}
                  stroke={ink.grid}
                  interval="preserveStartEnd"
                  minTickGap={14}
                />
                <YAxis tick={{ ...AXIS_TICK, fill: ink.axis }} stroke={ink.grid} width={46} />
                <Tooltip cursor={{ fill: ink.grid, fillOpacity: 0.45 }} {...tip} />
                <Bar dataKey="total" name="Commits" fill={ink.primary} radius={[2, 2, 0, 0]} maxBarSize={38} />
              </BarChart>
            ) : (
              <AreaChart data={trend} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ink.primary} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={ink.primary} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={ink.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ ...AXIS_TICK, fill: ink.axis }}
                  stroke={ink.grid}
                  interval="preserveStartEnd"
                  minTickGap={22}
                />
                <YAxis tick={{ ...AXIS_TICK, fill: ink.axis }} stroke={ink.grid} width={46} />
                <Tooltip cursor={{ stroke: ink.axis }} {...tip} />
                <Area
                  type="monotone"
                  dataKey="total"
                  name="Commits"
                  stroke={ink.primary}
                  strokeWidth={1.7}
                  fill="url(#trendFill)"
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="label">Most active</div>
            <div className="dimmer" style={{ fontSize: 'var(--fs-sm)' }}>
              top {leaders.length} in the selected window
            </div>
          </div>
        </div>

        <div className="chart-box">
          {leaders.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={leaders} layout="vertical" margin={{ top: 2, right: 12, left: 4, bottom: 2 }}>
                <CartesianGrid stroke={ink.grid} horizontal={false} />
                <XAxis type="number" tick={{ ...AXIS_TICK, fill: ink.axis }} stroke={ink.grid} />
                <YAxis
                  type="category"
                  dataKey="label"
                  tickFormatter={(v: string) => renderName(v)}
                  tick={{ ...AXIS_TICK, fill: ink.axis }}
                  stroke={ink.grid}
                  width={66}
                />
                <Tooltip cursor={{ fill: ink.grid, fillOpacity: 0.45 }} content={leaderTip} />
                <Bar dataKey="total" name="Commits" radius={[0, 2, 2, 0]} maxBarSize={16}>
                  {leaders.map((_, i) => (
                    // Rank fades toward the secondary ink — monochrome hierarchy.
                    <Cell key={i} fill={ink.primary} fillOpacity={1 - (i / Math.max(1, leaders.length)) * 0.55} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty" style={{ padding: 'var(--sp-6) 0' }}>
              <p className="dim">No contributions in this window yet.</p>
            </div>
          )}
        </div>

        <div className="row between" style={{ marginTop: 'var(--sp-3)', fontSize: 'var(--fs-sm)' }}>
          <span className="dimmer">Window total</span>
          <span className="mono bright">{fmt(trend.reduce((a, t) => a + t.total, 0))}</span>
        </div>
      </div>
    </div>
  );
}
