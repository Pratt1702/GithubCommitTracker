import { useEffect, useState } from 'react';
import type { Cohort, StudentStats } from '../../shared/types';
import { DEFAULT_FILTERS, useDashboard, type DashboardFilters } from '../hooks/useDashboard';
import Toolbar, { rangeLabel } from './Toolbar';
import KpiCards from './KpiCards';
import Charts from './Charts';
import StudentTable from './StudentTable';
import ImportModal from './ImportModal';
import StudentDetail from './StudentDetail';
import { MoveStudentModal, StudentModal } from './StudentModal';
import { ConfirmModal } from './ui';

interface Props {
  cohort: Cohort;
  allCohorts: Cohort[];
  refreshing: boolean;
  onRefresh: (mode: 'incremental' | 'full') => void;
  onRefreshStudent: (id: number) => void;
  notify: (message: string, kind?: 'ok' | 'alert') => void;
  reloadToken: number;
  onCohortsChanged: () => void;
}

/**
 * Cohort detail: the dashboard for one class. Importing and adding students is
 * only possible here (never from the cohort list), matching the intended flow.
 */
export default function CohortDetail({
  cohort,
  allCohorts,
  refreshing,
  onRefresh,
  onRefreshStudent,
  notify,
  reloadToken,
  onCohortsChanged,
}: Props) {
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const { range, summary, stats, trend, departments, loading, error, reload } = useDashboard(cohort.id, filters);

  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StudentStats | null>(null);
  const [viewing, setViewing] = useState<StudentStats | null>(null);
  const [moving, setMoving] = useState<StudentStats | null>(null);
  const [deleting, setDeleting] = useState<StudentStats | null>(null);

  // Re-query whenever a refresh finishes or the cohort list changes upstream.
  useEffect(() => {
    reload();
  }, [reloadToken]);

  const windowLabel = rangeLabel(filters.preset);

  const exportCsv = async () => {
    try {
      const path = await window.tracker.csv.exportStats(stats, windowLabel, cohort.name);
      if (path) notify(`Exported to ${path}`);
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'alert');
    }
  };

  const isEmpty = !loading && !stats.length && !filters.search && !filters.depts.length;

  return (
    <div className="main">
      <div className="page-head">
        <div>
          <h1 className="page">{cohort.name}</h1>
          <div className="page-sub">
            {[cohort.batch, cohort.dept, cohort.section && `Section ${cohort.section}`]
              .filter(Boolean)
              .join(' · ') || 'No batch details recorded'}
            {cohort.notes && ` — ${cohort.notes}`}
          </div>
        </div>
      </div>

      {error && <div className="notice alert">{error}</div>}

      {isEmpty ? (
        <div className="empty">
          <h3>No students in this cohort yet</h3>
          <p>
            Import the class roster as a CSV (a <strong>Name</strong> column and a <strong>GitHub link</strong>{' '}
            column are required; register number and department are optional), or add students one at a time.
          </p>
          <div className="row tight" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={() => setImporting(true)}>
              Import roster CSV
            </button>
            <button className="btn" onClick={() => setAdding(true)}>
              Add a student
            </button>
          </div>
        </div>
      ) : (
        <>
          <Toolbar
            filters={filters}
            onChange={setFilters}
            departments={departments}
            onImport={() => setImporting(true)}
            onAddStudent={() => setAdding(true)}
            onExport={exportCsv}
            onRefresh={onRefresh}
            refreshing={refreshing}
          />

          <KpiCards summary={summary} windowLabel={windowLabel} />

          <Charts trend={trend} stats={stats} granularity={filters.granularity} />

          <StudentTable
            stats={stats}
            windowLabel={windowLabel}
            loading={loading}
            onOpen={setViewing}
            onEdit={setEditing}
            onMove={setMoving}
            onDelete={setDeleting}
            onRefreshOne={(s) => onRefreshStudent(s.id)}
            onArchive={async (s) => {
              await window.tracker.students.setActive(s.id, s.active === 0);
              notify(s.active ? `${s.name} archived.` : `${s.name} restored.`);
              reload();
            }}
          />
        </>
      )}

      {importing && (
        <ImportModal
          cohortId={cohort.id}
          cohortName={cohort.name}
          onClose={() => setImporting(false)}
          onDone={() => {
            reload();
            onCohortsChanged();
          }}
        />
      )}

      {adding && (
        <StudentModal
          student={null}
          cohortId={cohort.id}
          onClose={() => setAdding(false)}
          onSaved={(m) => {
            notify(m);
            reload();
            onCohortsChanged();
          }}
        />
      )}

      {editing && (
        <StudentModal
          student={editing}
          cohortId={cohort.id}
          onClose={() => setEditing(null)}
          onSaved={(m) => {
            notify(m);
            reload();
          }}
        />
      )}

      {viewing && (
        <StudentDetail
          student={viewing}
          range={range}
          windowLabel={windowLabel}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
          onRefresh={() => {
            onRefreshStudent(viewing.id);
            setViewing(null);
          }}
        />
      )}

      {moving && (
        <MoveStudentModal
          student={moving}
          cohorts={allCohorts}
          currentCohortId={cohort.id}
          onClose={() => setMoving(null)}
          onMoved={(m) => {
            notify(m);
            reload();
            onCohortsChanged();
          }}
        />
      )}

      {deleting && (
        <ConfirmModal
          title={`Delete ${deleting.name}?`}
          message="This permanently removes the student and their entire collected contribution history from this cohort. Archive them instead if you only want them hidden from the numbers."
          confirmLabel="Delete student"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await window.tracker.students.remove(deleting.id);
            notify(`${deleting.name} deleted.`);
            reload();
            onCohortsChanged();
          }}
        />
      )}
    </div>
  );
}
