import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DateRange, StudentStats } from '../../shared/types';
import { bucketKey, bucketLabel } from '../../shared/dates';
import { AXIS_TICK, tooltipStyles, useChartInk } from '../hooks/useChartInk';
import { Modal, ago, fmt } from './ui';

interface Props {
  student: StudentStats;
  range: DateRange;
  windowLabel: string;
  onClose: () => void;
  onEdit: () => void;
  onRefresh: () => void;
}

/** Buckets a daily series into the 7-row × N-column GitHub-style calendar. */
function toWeeks(days: Array<{ date: string; count: number }>) {
  const weeks: Array<Array<{ date: string; count: number } | null>> = [];
  let current: Array<{ date: string; count: number } | null> = [];

  days.forEach((d, i) => {
    const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay();
    if (i === 0 && dow > 0) current = Array(dow).fill(null);
    current.push(d);
    if (dow === 6) {
      weeks.push(current);
      current = [];
    }
  });
  if (current.length) weeks.push(current);
  return weeks;
}

function level(count: number, max: number): string {
  if (count <= 0) return '';
  const r = count / Math.max(1, max);
  if (r > 0.66) return 'l4';
  if (r > 0.4) return 'l3';
  if (r > 0.15) return 'l2';
  return 'l1';
}

export default function StudentDetail({ student, range, windowLabel, onClose, onEdit, onRefresh }: Props) {
  const [series, setSeries] = useState<Array<{ date: string; count: number }>>([]);
  const [loading, setLoading] = useState(true);

  const ink = useChartInk();
  const tip = tooltipStyles(ink);

  // In all-time view, anchor the heatmap to this student's first commit rather
  // than the cohort-wide earliest day, so the calendar starts when they began.
  const chartRange =
    windowLabel === 'Total' && student.firstActiveDate
      ? { from: student.firstActiveDate, to: range.to }
      : range;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.tracker.students
      .series(student.id, chartRange)
      .then((s) => !cancelled && setSeries(s))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [student.id, chartRange.from, chartRange.to]);

  const weeks = useMemo(() => toWeeks(series), [series]);
  const maxDay = Math.max(1, ...series.map((d) => d.count));

  // Monthly roll-up so a long window is still readable as a line.
  const monthly = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of series) {
      const k = bucketKey(d.date, 'month');
      m.set(k, (m.get(k) ?? 0) + d.count);
    }
    return [...m.entries()].map(([k, total]) => ({ label: bucketLabel(k, 'month'), total }));
  }, [series]);

  return (
    <Modal title={student.name} subtitle={`@${student.username}`} onClose={onClose} wide>
      <div className="row tight wrap" style={{ marginBottom: 'var(--sp-4)' }}>
        {student.regNo && <span className="tag">Reg {student.regNo}</span>}
        {student.email && <span className="tag">{student.email}</span>}
        {student.dept && <span className="tag">{student.dept}</span>}
        {student.active === 0 && <span className="tag quiet">archived</span>}
        <span className="spacer" />
        <button className="btn sm" onClick={() => window.tracker.system.openExternal(student.link).catch(() => {})}>
          GitHub profile
        </button>
        <button className="btn sm" onClick={onEdit}>
          Edit
        </button>
        <button className="btn sm" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      {student.lastError && (
        <div className="notice alert">
          <strong>Last sync failed:</strong> {student.lastError}
        </div>
      )}

      <div className="stats">
        <div className="stat">
          <div className="label">{windowLabel}</div>
          <div className="stat-value">{fmt(student.windowTotal)}</div>
        </div>
        {windowLabel !== 'This year' && (
          <div className="stat">
            <div className="label">This year</div>
            <div className="stat-value">{fmt(student.yearTotal)}</div>
          </div>
        )}
        {windowLabel !== 'Total' && (
          <div className="stat">
            <div className="label">All time</div>
            <div className="stat-value">{fmt(student.lifetimeTotal)}</div>
          </div>
        )}
        <div className="stat">
          <div className="label">Active days</div>
          <div className="stat-value">{student.activeDays}</div>
          <div className="stat-sub">{student.avgPerDay} avg/day</div>
        </div>
        <div className="stat">
          <div className="label">Streak</div>
          <div className="stat-value">{student.currentStreak}</div>
          <div className="stat-sub">best {student.bestStreak} in window</div>
        </div>
        <div className="stat">
          <div className="label">Last active</div>
          <div className="stat-value" style={{ fontSize: 'var(--fs-lg)' }}>
            {student.lastActiveDate ?? 'never'}
          </div>
          <div className="stat-sub">synced {ago(student.lastSyncedAt)}</div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 'var(--sp-3)' }}>
        <div className="label" style={{ marginBottom: 'var(--sp-3)' }}>
          Daily activity · {chartRange.from} → {chartRange.to}
        </div>

        {loading ? (
          <div className="empty">
            <span className="spinner" />
          </div>
        ) : (
          <>
            <div className="heatmap">
              {weeks.map((w, i) => (
                <div className="heat-week" key={i}>
                  {Array.from({ length: 7 }).map((_, di) => {
                    const d = w[di];
                    if (!d) return <span className="heat-day" key={di} style={{ visibility: 'hidden' }} />;
                    return (
                      <span
                        key={di}
                        className={`heat-day ${level(d.count, maxDay)}`}
                        title={`${d.date}: ${d.count} contribution${d.count === 1 ? '' : 's'}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="legend">
              <span>less</span>
              <span className="heat-day" />
              <span className="heat-day l1" />
              <span className="heat-day l2" />
              <span className="heat-day l3" />
              <span className="heat-day l4" />
              <span>more</span>
              <span className="spacer" />
              <span>peak {maxDay}/day</span>
            </div>
          </>
        )}
      </div>

      {monthly.length > 1 && (
        <div className="panel">
          <div className="label" style={{ marginBottom: 'var(--sp-3)' }}>
            Monthly totals
          </div>
          <div className="chart-box short">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthly} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="studentFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ink.primary} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={ink.primary} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={ink.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ ...AXIS_TICK, fill: ink.axis }} stroke={ink.grid} minTickGap={16} />
                <YAxis tick={{ ...AXIS_TICK, fill: ink.axis }} stroke={ink.grid} width={44} />
                <Tooltip {...tip} />
                <Area
                  type="monotone"
                  dataKey="total"
                  name="Commits"
                  stroke={ink.primary}
                  strokeWidth={1.6}
                  fill="url(#studentFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Modal>
  );
}
