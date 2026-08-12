import { useMemo, useState } from 'react';
import type { StudentStats } from '../../shared/types';
import { KebabMenu, ago, fmt } from './ui';

export type SortKey =
  | 'name'
  | 'regNo'
  | 'dept'
  | 'windowTotal'
  | 'yearTotal'
  | 'lifetimeTotal'
  | 'activeDays'
  | 'avgPerDay'
  | 'currentStreak'
  | 'bestStreak'
  | 'lastActiveDate';

interface Column {
  key: SortKey;
  label: string;
  num?: boolean;
  title?: string;
}

interface Props {
  stats: StudentStats[];
  windowLabel: string;
  loading: boolean;
  onOpen: (s: StudentStats) => void;
  onEdit: (s: StudentStats) => void;
  onRefreshOne: (s: StudentStats) => void;
  onArchive: (s: StudentStats) => void;
  onDelete: (s: StudentStats) => void;
  onMove: (s: StudentStats) => void;
}

export default function StudentTable({
  stats,
  windowLabel,
  loading,
  onOpen,
  onEdit,
  onRefreshOne,
  onArchive,
  onDelete,
  onMove,
}: Props) {
  const [sort, setSort] = useState<SortKey>('windowTotal');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  // When the selected window IS the current year (or all time), the dedicated
  // "This year" / "All time" column would duplicate the window column, so it is
  // dropped rather than shown twice with identical headers.
  const yearIsWindow = windowLabel === 'This year';
  const lifetimeIsWindow = windowLabel === 'Total';

  const columns: Column[] = [
    { key: 'name', label: 'Student' },
    { key: 'regNo', label: 'Reg no.' },
    { key: 'dept', label: 'Dept' },
    { key: 'windowTotal', label: windowLabel, num: true, title: `Commits in the selected window (${windowLabel})` },
    ...(yearIsWindow ? [] : [{ key: 'yearTotal' as SortKey, label: 'This year', num: true }]),
    ...(lifetimeIsWindow ? [] : [{ key: 'lifetimeTotal' as SortKey, label: 'All time', num: true }]),
    { key: 'activeDays', label: 'Active days', num: true, title: 'Distinct days with at least one contribution' },
    { key: 'avgPerDay', label: 'Avg/day', num: true },
    { key: 'currentStreak', label: 'Streak', num: true, title: 'Current streak · best streak in window' },
    { key: 'lastActiveDate', label: 'Last active' },
  ];

  const maxWindow = Math.max(1, ...stats.map((s) => s.windowTotal));

  // If the active sort column just got hidden by a range change, fall back to
  // the window column so the arrow never points at a column that isn't there.
  const activeSort = columns.some((c) => c.key === sort) ? sort : 'windowTotal';

  const sorted = useMemo(() => {
    const rows = [...stats];
    const mul = dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[activeSort];
      const bv = b[activeSort];
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
      return String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' }) * mul;
    });
    return rows;
  }, [stats, activeSort, dir]);

  const click = (key: SortKey) => {
    if (key === sort) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(key);
      // Numeric columns are most useful highest-first; text A→Z.
      setDir(['name', 'regNo', 'dept', 'lastActiveDate'].includes(key) ? 'asc' : 'desc');
    }
  };

  if (loading && !stats.length) {
    return (
      <div className="table-wrap">
        <div className="empty">
          <span className="spinner" /> <span className="dim">Loading students…</span>
        </div>
      </div>
    );
  }

  if (!stats.length) {
    return (
      <div className="table-wrap">
        <div className="empty">
          <h3>No students match</h3>
          <p>Import a roster CSV or add a student, and clear any active filters.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                title={c.title}
                className={`sortable${c.num ? ' num' : ''}`}
                onClick={() => click(c.key)}
              >
                {c.label}
                {activeSort === c.key && <span className="sort-arrow">{dir === 'asc' ? '↑' : '↓'}</span>}
              </th>
            ))}
            <th style={{ width: 44 }} aria-label="Actions" />
          </tr>
        </thead>

        <tbody>
          {sorted.map((s) => (
            <tr key={s.id} onClick={() => onOpen(s)} style={{ cursor: 'pointer' }}>
              <td>
                <div className="cell-stack">
                  <span className="top truncate">
                    {s.name}
                    {s.active === 0 && (
                      <span className="tag quiet" style={{ marginLeft: 6 }}>
                        archived
                      </span>
                    )}
                    {s.lastError && (
                      <span className="tag alert" style={{ marginLeft: 6 }} title={s.lastError}>
                        sync error
                      </span>
                    )}
                  </span>
                  <span
                    className="sub link-handle"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.tracker.system.openExternal(s.link).catch(() => {});
                    }}
                    title={s.link}
                  >
                    @{s.username}
                  </span>
                </div>
              </td>

              <td className="mono dim">{s.regNo || '—'}</td>
              <td className="dim">{s.dept || '—'}</td>

              <td className="num">
                <div className="bar-cell">
                  <span className="bright">{fmt(s.windowTotal)}</span>
                  <span className="bar-track">
                    <i style={{ width: `${(s.windowTotal / maxWindow) * 100}%` }} />
                  </span>
                </div>
              </td>

              {!yearIsWindow && <td className="num">{fmt(s.yearTotal)}</td>}
              {!lifetimeIsWindow && <td className="num dim">{fmt(s.lifetimeTotal)}</td>}
              <td className="num">{s.activeDays}</td>
              <td className="num dim">{s.avgPerDay}</td>
              <td className="num">
                {s.currentStreak}
                <span className="dimmer"> / {s.bestStreak}</span>
              </td>
              <td className="dim nowrap">{s.lastActiveDate ?? 'never'}</td>

              <td onClick={(e) => e.stopPropagation()}>
                <div className="row-actions">
                  <KebabMenu label={`Actions for ${s.name}`}>
                    <button className="menu-item" onClick={() => onOpen(s)}>
                      View detail
                    </button>
                    <button className="menu-item" onClick={() => onEdit(s)}>
                      Edit student
                    </button>
                    <button className="menu-item" onClick={() => onRefreshOne(s)}>
                      Refresh this student
                    </button>
                    <button
                      className="menu-item"
                      onClick={() => window.tracker.system.openExternal(s.link).catch(() => {})}
                    >
                      Open GitHub profile
                    </button>
                    <button className="menu-item" onClick={() => onMove(s)}>
                      Move to cohort…
                    </button>
                    <div className="menu-sep" />
                    <button className="menu-item" onClick={() => onArchive(s)}>
                      {s.active ? 'Archive student' : 'Restore student'}
                    </button>
                    <button className="menu-item danger" onClick={() => onDelete(s)}>
                      Delete student…
                    </button>
                  </KebabMenu>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div
        className="row between"
        style={{
          padding: 'var(--sp-2) var(--sp-3)',
          borderTop: '1px solid var(--line)',
          fontSize: 'var(--fs-sm)',
          color: 'var(--dimmer)',
        }}
      >
        <span>
          {sorted.length} student{sorted.length === 1 ? '' : 's'}
        </span>
        <span>
          Last synced {ago(sorted.map((s) => s.lastSyncedAt).sort().reverse()[0] ?? null)}
        </span>
      </div>
    </div>
  );
}
