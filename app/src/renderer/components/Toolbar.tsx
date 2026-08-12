import { useState } from 'react';
import type { DeptOption, Granularity, RangePreset } from '../../shared/types';
import type { DashboardFilters } from '../hooks/useDashboard';
import { useDismiss } from '../hooks/useDashboard';

/** Table/chart range presets. Each carries the granularity that reads best. */
export const RANGE_PRESETS: Array<{ key: RangePreset; label: string; granularity: Granularity }> = [
  { key: '28d', label: '28 days', granularity: 'day' },
  { key: '3m', label: '3 months', granularity: 'week' },
  { key: '6m', label: '6 months', granularity: 'week' },
  { key: 'ytd', label: 'This year', granularity: 'month' },
  { key: 'all', label: 'Total', granularity: 'year' },
];

const GRANULARITIES: Array<{ key: Granularity; label: string }> = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
  { key: 'year', label: 'Yearly' },
];

export function rangeLabel(preset: RangePreset): string {
  return RANGE_PRESETS.find((p) => p.key === preset)?.label ?? 'Custom';
}

interface Props {
  filters: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  departments: DeptOption[];
  onImport: () => void;
  onAddStudent: () => void;
  onExport: () => void;
  onRefresh: (mode: 'incremental' | 'full') => void;
  refreshing: boolean;
}

export default function Toolbar({
  filters,
  onChange,
  departments,
  onImport,
  onAddStudent,
  onExport,
  onRefresh,
  refreshing,
}: Props) {
  const [deptOpen, setDeptOpen] = useState(false);
  const [refreshOpen, setRefreshOpen] = useState(false);
  const deptRef = useDismiss(deptOpen, () => setDeptOpen(false));
  const refreshRef = useDismiss(refreshOpen, () => setRefreshOpen(false));

  const setPreset = (key: RangePreset) => {
    const p = RANGE_PRESETS.find((x) => x.key === key)!;
    onChange({ ...filters, preset: key, granularity: p.granularity });
  };

  const toggleDept = (dept: string) => {
    const next = filters.depts.includes(dept)
      ? filters.depts.filter((d) => d !== dept)
      : [...filters.depts, dept];
    onChange({ ...filters, depts: next });
  };

  return (
    <div className="col" style={{ gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
      <div className="row wrap tight">
        <div className="btn-group">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.key}
              className={filters.preset === p.key ? 'active' : undefined}
              onClick={() => setPreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="btn-group">
          {GRANULARITIES.map((g) => (
            <button
              key={g.key}
              className={filters.granularity === g.key ? 'active' : undefined}
              onClick={() => onChange({ ...filters, granularity: g.key })}
            >
              {g.label}
            </button>
          ))}
        </div>

        <span className="spacer" />

        <div className="pop-wrap" ref={refreshRef}>
          <button className="btn" onClick={() => setRefreshOpen((o) => !o)} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh cohort'}
          </button>
          {refreshOpen && (
            <div className="menu right" onClick={() => setRefreshOpen(false)}>
              <button className="menu-item" onClick={() => onRefresh('incremental')}>
                Refresh this year (fast)
              </button>
              <button className="menu-item" onClick={() => onRefresh('full')}>
                Rebuild all history
              </button>
            </div>
          )}
        </div>

        <button className="btn" onClick={onImport}>
          Import CSV
        </button>
        <button className="btn" onClick={onAddStudent}>
          Add student
        </button>
        <button className="btn ghost" onClick={onExport}>
          Export
        </button>
      </div>

      <div className="row wrap tight">
        <input
          className="field search"
          placeholder="Search name, register number, GitHub handle or department…"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />

        <div className="pop-wrap" ref={deptRef}>
          <button className="btn" onClick={() => setDeptOpen((o) => !o)}>
            {filters.depts.length ? `Dept · ${filters.depts.length}` : 'All departments'}
          </button>
          {deptOpen && (
            <div className="menu left menu-scroll">
              {!departments.length && <div className="menu-item dim">No departments recorded</div>}
              {departments.map((d) => {
                const value = d.dept === 'Unassigned' ? '' : d.dept;
                return (
                  <label key={d.dept} className="menu-item">
                    <input
                      type="checkbox"
                      checked={filters.depts.includes(value)}
                      onChange={() => toggleDept(value)}
                    />
                    <span className="spacer">{d.dept}</span>
                    <span className="dimmer">{d.count}</span>
                  </label>
                );
              })}
              {filters.depts.length > 0 && (
                <>
                  <div className="menu-sep" />
                  <button className="menu-item" onClick={() => onChange({ ...filters, depts: [] })}>
                    Clear filter
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={filters.includeInactive}
            onChange={(e) => onChange({ ...filters, includeInactive: e.target.checked })}
          />
          Show archived
        </label>

        {(filters.search || filters.depts.length || filters.includeInactive) && (
          <button
            className="btn ghost sm"
            onClick={() => onChange({ ...filters, search: '', depts: [], includeInactive: false })}
          >
            Reset filters
          </button>
        )}
      </div>
    </div>
  );
}
