import { useCallback, useEffect, useState } from 'react';
import type { Cohort } from '../shared/types';
import { useRefreshProgress, useTheme } from './hooks/useDashboard';
import TitleBar from './components/TitleBar';
import CohortsPage from './components/CohortsPage';
import CohortDetail from './components/CohortDetail';
import { Toast } from './components/ui';

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [toast, setToast] = useState<{ message: string; kind: 'ok' | 'alert' } | null>(null);

  const notify = useCallback((message: string, kind: 'ok' | 'alert' = 'ok') => setToast({ message, kind }), []);
  const bumpReload = useCallback(() => setReloadToken((n) => n + 1), []);

  const loadCohorts = useCallback(async () => {
    try {
      setCohorts(await window.tracker.cohorts.getAll());
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'alert');
    }
  }, [notify]);

  useEffect(() => {
    loadCohorts();
  }, [loadCohorts]);

  // A finished refresh re-queries whichever screen is open.
  const progress = useRefreshProgress(
    useCallback(() => {
      bumpReload();
      loadCohorts();
    }, [bumpReload, loadCohorts]),
  );

  const refreshing = progress !== null;
  const open = cohorts.find((c) => c.id === openId) ?? null;

  // If the open cohort is deleted elsewhere, fall back to the list.
  useEffect(() => {
    if (openId !== null && cohorts.length && !cohorts.some((c) => c.id === openId)) setOpenId(null);
  }, [cohorts, openId]);

  const guardedRefresh = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'alert');
    }
  };

  return (
    <div className="app">
      <TitleBar
        theme={theme}
        onToggleTheme={toggleTheme}
        crumbs={
          open
            ? [{ label: 'Cohorts', onClick: () => setOpenId(null) }, { label: open.name }]
            : [{ label: 'Cohorts' }]
        }
      />

      {progress && (
        <div className="sync-strip">
          <span className="spinner" />
          <span className="bright">
            Refreshing {progress.done}/{progress.total}
          </span>
          {progress.currentName && <span className="dim truncate">{progress.currentName}</span>}
          <span className="progress">
            <i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </span>
          {progress.failed > 0 && <span className="neg">{progress.failed} failed</span>}
          <span className="spacer" />
          <button className="btn ghost sm" onClick={() => window.tracker.refresh.cancel()}>
            Cancel
          </button>
        </div>
      )}

      {open ? (
        <CohortDetail
          cohort={open}
          allCohorts={cohorts}
          refreshing={refreshing}
          reloadToken={reloadToken}
          notify={notify}
          onCohortsChanged={loadCohorts}
          onRefresh={(mode) => guardedRefresh(() => window.tracker.refresh.cohort(open.id, mode))}
          onRefreshStudent={(id) => guardedRefresh(() => window.tracker.refresh.one(id))}
        />
      ) : (
        <CohortsPage
          onOpenCohort={(id) => {
            setOpenId(id);
            loadCohorts();
          }}
          refreshing={refreshing}
          reloadToken={reloadToken}
          notify={notify}
          onRefreshAll={() => guardedRefresh(() => window.tracker.refresh.all('incremental'))}
        />
      )}

      {toast && <Toast message={toast.message} kind={toast.kind} onDone={() => setToast(null)} />}
    </div>
  );
}
