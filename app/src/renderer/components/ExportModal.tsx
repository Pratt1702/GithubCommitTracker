import { useMemo, useState } from 'react';
import type { DeptOption, ExportColumnKey, ExportOptions, RangePreset } from '../../shared/types';
import { resolveRange } from '../../shared/dates';
import { RANGE_PRESETS, rangeLabel } from './Toolbar';
import { Modal } from './ui';

interface Props {
  cohortId: number;
  cohortName: string;
  departments: DeptOption[];
  /** Prefill from the cohort's current dashboard filters. */
  initialDepts: string[];
  initialSearch: string;
  initialScope: 'active' | 'inactive' | 'both';
  onClose: () => void;
  onDone: (message: string) => void;
}

/** The full, ordered set of columns the export can emit. */
const ALL_COLUMNS: Array<{ key: ExportColumnKey; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'regNo', label: 'Register number' },
  { key: 'email', label: 'Email' },
  { key: 'dept', label: 'Department' },
  { key: 'username', label: 'GitHub username' },
  { key: 'link', label: 'Profile link' },
  { key: 'windowTotal', label: 'Contributions (window)' },
  { key: 'yearTotal', label: 'Contributions (this year)' },
  { key: 'lifetimeTotal', label: 'Contributions (lifetime)' },
  { key: 'activeDays', label: 'Active days (window)' },
  { key: 'avgPerDay', label: 'Average / day' },
  { key: 'currentStreak', label: 'Current streak' },
  { key: 'bestStreak', label: 'Best streak' },
  { key: 'lastActiveDate', label: 'Last active date' },
  { key: 'lastSyncedAt', label: 'Last synced' },
  { key: 'lastError', label: 'Sync error' },
  { key: 'inactiveFlag', label: 'Inactive in window? (YES / NO)' },
];

const DEFAULT_COLUMNS: ExportColumnKey[] = ALL_COLUMNS.map((c) => c.key);

/**
 * Customizable cohort export: pick the window, which students (active / archived
 * / both), and exactly which columns to write. Purely DB-driven — no live GitHub
 * scraping — so it completes instantly once the file is chosen.
 */
export default function ExportModal({
  cohortId,
  cohortName,
  departments,
  initialDepts,
  initialSearch,
  initialScope,
  onClose,
  onDone,
}: Props) {
  const [preset, setPreset] = useState<string>('28d');
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [scope, setScope] = useState<'active' | 'inactive' | 'both'>(initialScope);
  const [depts, setDepts] = useState<string[]>(initialDepts);
  const [search, setSearch] = useState(initialSearch);
  const [columns, setColumns] = useState<ExportColumnKey[]>(DEFAULT_COLUMNS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleColumn = (key: ExportColumnKey) => {
    setColumns((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));
  };
  const toggleDept = (d: string) => {
    setDepts((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const doExport = async () => {
    if (!columns.length) {
      setError('Select at least one column to export.');
      return;
    }
    if (preset === 'custom' && (!custom.from || !custom.to)) {
      setError('Pick both a start and end date for a custom window.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const range =
        preset === 'custom'
          ? { from: custom.from, to: custom.to }
          : resolveRange(preset as RangePreset, new Date(), preset === 'custom' ? custom : undefined);
      const options: ExportOptions = {
        range,
        windowLabel: rangeLabel(preset as RangePreset),
        scope,
        depts,
        search,
        columns,
      };
      const res = await window.tracker.csv.exportCustom(cohortId, options);
      if (!res) {
        onClose();
        return;
      }
      onDone(`Exported ${res.count} student${res.count === 1 ? '' : 's'} to ${res.path}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Export activity"
      subtitle={`Build a tailored CSV for “${cohortName}”. Only the columns and students you pick are included.`}
      onClose={onClose}
      wide
    >
      {error && <div className="notice alert">{error}</div>}

      <div className="label" style={{ marginBottom: 'var(--sp-2)' }}>
        Date window
      </div>
      <div className="btn-group wrap">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.key}
            className={preset === p.key ? 'active' : undefined}
            onClick={() => setPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
        <button className={preset === 'custom' ? 'active' : undefined} onClick={() => setPreset('custom')}>
          Custom
        </button>
      </div>
      {preset === 'custom' && (
        <div className="row wrap tight" style={{ marginTop: 'var(--sp-3)' }}>
          <input
            className="field"
            type="date"
            value={custom.from}
            max={custom.to || today}
            onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
          />
          <span className="dim">to</span>
          <input
            className="field"
            type="date"
            value={custom.to}
            min={custom.from}
            max={today}
            onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
          />
        </div>
      )}

      <div className="label" style={{ margin: 'var(--sp-4) 0 var(--sp-2)' }}>
        Which students
      </div>
      <div className="btn-group wrap">
        <button className={scope === 'both' ? 'active' : undefined} onClick={() => setScope('both')}>
          Active + archived
        </button>
        <button className={scope === 'active' ? 'active' : undefined} onClick={() => setScope('active')}>
          Active only
        </button>
        <button className={scope === 'inactive' ? 'active' : undefined} onClick={() => setScope('inactive')}>
          Archived only
        </button>
      </div>

      <div className="label" style={{ margin: 'var(--sp-4) 0 var(--sp-2)' }}>
        Search (optional)
      </div>
      <input
        className="field"
        placeholder="Filter by name, register number, GitHub handle or department…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {departments.length > 0 && (
        <>
          <div className="label" style={{ margin: 'var(--sp-4) 0 var(--sp-2)' }}>
            Departments
          </div>
          <div className="row wrap tight">
            {departments.map((d) => {
              const value = d.dept === 'Unassigned' ? '' : d.dept;
              const checked = depts.includes(value);
              return (
                <label key={d.dept} className={`chip ${checked ? 'on' : undefined}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleDept(value)} />
                  {d.dept}
                </label>
              );
            })}
            {depts.length > 0 && (
              <button className="btn ghost sm" onClick={() => setDepts([])}>
                Clear
              </button>
            )}
          </div>
        </>
      )}

      <div className="label" style={{ margin: 'var(--sp-4) 0 var(--sp-2)' }}>
        Columns to include
      </div>
      <div className="row between tight" style={{ marginBottom: 'var(--sp-2)' }}>
        <span className="dim sm">{columns.length} of {ALL_COLUMNS.length} selected</span>
        <span className="row tight">
          <button className="btn ghost sm" onClick={() => setColumns(DEFAULT_COLUMNS)}>
            All
          </button>
          <button className="btn ghost sm" onClick={() => setColumns([])}>
            None
          </button>
        </span>
      </div>
      <div className="col-check">
        {ALL_COLUMNS.map((c) => (
          <label key={c.key} className="check">
            <input type="checkbox" checked={columns.includes(c.key)} onChange={() => toggleColumn(c.key)} />
            {c.label}
          </label>
        ))}
      </div>

      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={doExport} disabled={busy}>
          {busy ? 'Exporting…' : 'Export CSV…'}
        </button>
      </div>
    </Modal>
  );
}
