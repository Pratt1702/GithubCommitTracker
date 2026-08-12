import { useEffect, useState } from 'react';
import type { Cohort, CohortInput, CohortSummary, DateRange, Granularity, RangePreset } from '../../shared/types';
import { resolveRange } from '../../shared/dates';
import { ConfirmModal, KebabMenu, Modal, Sparkline, ago, fmt } from './ui';

const PRESETS: Array<{ key: RangePreset; label: string; granularity: Granularity }> = [
  { key: '28d', label: '28 days', granularity: 'day' },
  { key: '3m', label: '3 months', granularity: 'week' },
  { key: '6m', label: '6 months', granularity: 'week' },
  { key: 'ytd', label: 'This year', granularity: 'month' },
  { key: 'all', label: 'All time', granularity: 'month' },
];

const EMPTY_INPUT: CohortInput = { name: '', batch: '', dept: '', section: '', notes: '' };

function CohortForm({
  initial,
  heading,
  onSave,
  onClose,
}: {
  initial: CohortInput;
  heading: string;
  onSave: (input: CohortInput) => Promise<void>;
  onClose: () => void;
}) {
  const [input, setInput] = useState<CohortInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof CohortInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setInput((p) => ({ ...p, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(input);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={heading}
      subtitle="A cohort is a class you track together — for example the 2026 batch, CSE section B."
      onClose={onClose}
    >
      {error && <div className="notice alert">{error}</div>}

      <div className="form-row">
        <span className="label">Cohort name *</span>
        <input
          className="field"
          autoFocus
          placeholder="2026 Batch — CSE B"
          value={input.name}
          onChange={set('name')}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </div>

      <div className="form-grid">
        <div className="form-row">
          <span className="label">Batch</span>
          <input className="field" placeholder="2026" value={input.batch} onChange={set('batch')} />
        </div>
        <div className="form-row">
          <span className="label">Department</span>
          <input className="field" placeholder="CSE" value={input.dept} onChange={set('dept')} />
        </div>
      </div>

      <div className="form-grid">
        <div className="form-row">
          <span className="label">Section</span>
          <input className="field" placeholder="B" value={input.section} onChange={set('section')} />
        </div>
        <div className="form-row">
          <span className="label">Notes</span>
          <input className="field" placeholder="Optional" value={input.notes} onChange={set('notes')} />
        </div>
      </div>

      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={submit} disabled={busy || !input.name.trim()}>
          {busy ? 'Saving…' : 'Save cohort'}
        </button>
      </div>
    </Modal>
  );
}

interface Props {
  onOpenCohort: (id: number) => void;
  refreshing: boolean;
  onRefreshAll: () => void;
  notify: (message: string, kind?: 'ok' | 'alert') => void;
  reloadToken: number;
}

/**
 * Home screen: one card per cohort with roll-up numbers, plus the
 * "refresh every cohort" action. Importing/adding students happens inside a
 * cohort, so this screen only creates, edits and opens cohorts.
 */
export default function CohortsPage({ onOpenCohort, refreshing, onRefreshAll, notify, reloadToken }: Props) {
  const [preset, setPreset] = useState<RangePreset>('28d');
  const [summaries, setSummaries] = useState<CohortSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Cohort | null>(null);
  const [deleting, setDeleting] = useState<CohortSummary | null>(null);
  const [nonce, setNonce] = useState(0);

  const active = PRESETS.find((p) => p.key === preset) ?? PRESETS[0];
  const reload = () => setNonce((n) => n + 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let range: DateRange = resolveRange(preset);
        if (preset === 'all') {
          const earliest = await window.tracker.dashboard.earliestDate();
          if (earliest) range = { from: earliest, to: range.to };
        }
        const rows = await window.tracker.cohorts.summaries(range, active.granularity);
        if (!cancelled) setSummaries(rows);
      } catch (err) {
        if (!cancelled) notify(err instanceof Error ? err.message : String(err), 'alert');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preset, nonce, reloadToken, refreshing]);

  const totals = summaries.reduce(
    (a, c) => ({
      students: a.students + c.studentCount,
      window: a.window + c.windowTotal,
      year: a.year + c.yearTotal,
      lifetime: a.lifetime + c.lifetimeTotal,
      errored: a.errored + c.erroredCount,
    }),
    { students: 0, window: 0, year: 0, lifetime: 0, errored: 0 },
  );

  return (
    <div className="main">
      <div className="page-head">
        <div>
          <h1 className="page">Cohorts</h1>
          <div className="page-sub">
            {summaries.length} cohort{summaries.length === 1 ? '' : 's'} · {totals.students} student
            {totals.students === 1 ? '' : 's'} tracked
          </div>
        </div>

        <div className="row tight wrap">
          <div className="btn-group">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                className={p.key === preset ? 'active' : undefined}
                onClick={() => setPreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button className="btn" onClick={onRefreshAll} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh all'}
          </button>
          <button className="btn primary" onClick={() => setCreating(true)}>
            New cohort
          </button>
        </div>
      </div>

      {totals.errored > 0 && (
        <div className="notice alert">
          <strong>{totals.errored}</strong> student{totals.errored === 1 ? '' : 's'} could not be synced — open the
          cohort to see which GitHub links need fixing.
        </div>
      )}

      {summaries.length > 0 && (
        <div className="stats">
          <div className="stat">
            <div className="label">Commits · {active.label}</div>
            <div className="stat-value">{fmt(totals.window)}</div>
          </div>
          <div className="stat">
            <div className="label">This year</div>
            <div className="stat-value">{fmt(totals.year)}</div>
          </div>
          <div className="stat">
            <div className="label">All time</div>
            <div className="stat-value">{fmt(totals.lifetime)}</div>
          </div>
          <div className="stat">
            <div className="label">Students</div>
            <div className="stat-value">{fmt(totals.students)}</div>
          </div>
        </div>
      )}

      {loading && !summaries.length ? (
        <div className="empty">
          <span className="spinner" /> <span className="dim">Loading cohorts…</span>
        </div>
      ) : !summaries.length ? (
        <div className="empty">
          <h3>No cohorts yet</h3>
          <p>
            Create a cohort for each class you want to track — for example “2026 Batch — CSE B”. Once it exists you
            can import that class's roster CSV and refresh their GitHub activity.
          </p>
          <button className="btn primary" onClick={() => setCreating(true)}>
            Create your first cohort
          </button>
        </div>
      ) : (
        <div className="cohort-grid">
          {summaries.map((c) => (
            <div
              key={c.id}
              className="cohort-card"
              role="button"
              tabIndex={0}
              onClick={() => onOpenCohort(c.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpenCohort(c.id)}
            >
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="cohort-name truncate">{c.name}</div>
                  <div className="cohort-meta" style={{ marginTop: 6 }}>
                    {c.batch && <span className="tag">{c.batch}</span>}
                    {c.dept && <span className="tag">{c.dept}</span>}
                    {c.section && <span className="tag">Sec {c.section}</span>}
                    <span className="tag quiet">{c.studentCount} students</span>
                    {c.erroredCount > 0 && <span className="tag alert">{c.erroredCount} errors</span>}
                  </div>
                </div>

                <div onClick={(e) => e.stopPropagation()}>
                  <KebabMenu label={`Actions for ${c.name}`}>
                    <button className="menu-item" onClick={() => onOpenCohort(c.id)}>
                      Open cohort
                    </button>
                    <button
                      className="menu-item"
                      onClick={() =>
                        setEditing({
                          id: c.id,
                          name: c.name,
                          batch: c.batch,
                          dept: c.dept,
                          section: c.section,
                          notes: c.notes,
                          createdAt: c.createdAt,
                          updatedAt: c.updatedAt,
                        })
                      }
                    >
                      Edit details
                    </button>
                    <div className="menu-sep" />
                    <button className="menu-item danger" onClick={() => setDeleting(c)}>
                      Delete cohort…
                    </button>
                  </KebabMenu>
                </div>
              </div>

              <Sparkline values={c.spark} />

              <div className="cohort-figures">
                <div className="cohort-figure">
                  <div className="label">{active.label}</div>
                  <div className="v tabular">{fmt(c.windowTotal)}</div>
                </div>
                <div className="cohort-figure">
                  <div className="label">This year</div>
                  <div className="v tabular">{fmt(c.yearTotal)}</div>
                </div>
                <div className="cohort-figure">
                  <div className="label">Avg / student</div>
                  <div className="v tabular">{fmt(c.avgPerStudent)}</div>
                </div>
              </div>

              <div className="row between" style={{ fontSize: 'var(--fs-sm)' }}>
                <span className="dimmer">Synced {ago(c.lastSyncedAt)}</span>
                {c.inactiveInWindow > 0 ? (
                  <span className="dim">{c.inactiveInWindow} inactive</span>
                ) : (
                  <span className="dimmer">all active</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <CohortForm
          heading="New cohort"
          initial={EMPTY_INPUT}
          onClose={() => setCreating(false)}
          onSave={async (input) => {
            const id = await window.tracker.cohorts.create(input);
            notify(`Cohort “${input.name}” created — import a roster to get started.`);
            reload();
            onOpenCohort(id);
          }}
        />
      )}

      {editing && (
        <CohortForm
          heading="Edit cohort"
          initial={{
            name: editing.name,
            batch: editing.batch,
            dept: editing.dept,
            section: editing.section,
            notes: editing.notes,
          }}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            await window.tracker.cohorts.update(editing.id, input);
            notify('Cohort updated.');
            reload();
          }}
        />
      )}

      {deleting && (
        <ConfirmModal
          title={`Delete “${deleting.name}”?`}
          message={`This permanently removes the cohort, its ${deleting.studentCount} student${
            deleting.studentCount === 1 ? '' : 's'
          } and all collected contribution history. This cannot be undone.`}
          confirmLabel="Delete cohort"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await window.tracker.cohorts.remove(deleting.id);
            notify(`Cohort “${deleting.name}” deleted.`);
            reload();
          }}
        />
      )}
    </div>
  );
}
