import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DashboardSummary,
  DateRange,
  DeptOption,
  Granularity,
  RangePreset,
  RefreshProgress,
  StudentStats,
  ThemeMode,
  TrendPoint,
} from '../../shared/types';
import { resolveRange } from '../../shared/dates';

/** Theme, persisted in SQLite so the choice survives a restart. */
export function useTheme(): [ThemeMode, () => void] {
  const [theme, setTheme] = useState<ThemeMode>('dark');

  useEffect(() => {
    window.tracker.theme.get().then((t) => {
      setTheme(t);
      document.documentElement.dataset.theme = t;
    });
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      window.tracker.theme.set(next);
      return next;
    });
  }, []);

  return [theme, toggle];
}

/** Subscribes to refresh progress broadcast from the main process. */
export function useRefreshProgress(onFinished: () => void): RefreshProgress | null {
  const [progress, setProgress] = useState<RefreshProgress | null>(null);
  const cb = useRef(onFinished);
  cb.current = onFinished;

  useEffect(() => {
    return window.tracker.refresh.onProgress((p) => {
      setProgress(p.finished ? null : p);
      if (p.finished) cb.current();
    });
  }, []);

  useEffect(() => {
    window.tracker.refresh.isRunning().then((running) => {
      if (!running) setProgress(null);
    });
  }, []);

  return progress;
}

export interface DashboardFilters {
  preset: RangePreset;
  custom?: DateRange;
  granularity: Granularity;
  search: string;
  depts: string[];
  includeInactive: boolean;
}

export const DEFAULT_FILTERS: DashboardFilters = {
  preset: '28d',
  granularity: 'day',
  search: '',
  depts: [],
  includeInactive: false,
};

/** Builds the StatsFilter the renderer sends to the DB layer from UI filters. */
function makeFilter(filters: DashboardFilters, cohortId: number | undefined, resolved: DateRange): StatsFilter {
  return {
    range: resolved,
    cohortId,
    depts: filters.depts,
    search: filters.search,
    includeInactive: filters.includeInactive,
  };
}

export type StatsFilter = {
  range: DateRange;
  cohortId?: number;
  depts?: string[];
  search?: string;
  includeInactive?: boolean;
};

export interface DashboardData {
  range: DateRange;
  summary: DashboardSummary | null;
  stats: StudentStats[];
  trend: TrendPoint[];
  departments: DeptOption[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads everything the dashboard renders for a given cohort (or all cohorts
 * when cohortId is undefined) and re-queries whenever filters change.
 */
export function useDashboard(cohortId: number | undefined, filters: DashboardFilters): DashboardData {
  const [range, setRange] = useState<DateRange>(() => resolveRange(filters.preset, new Date(), filters.custom));
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [stats, setStats] = useState<StudentStats[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // The refresh service fires this once per student as they finish scraping, so
  // the table/numbers update live instead of freezing until the whole cohort is
  // done. We patch just that row's stats in and re-derive the aggregates.
  // `liveFilterRef` holds the most recent StatsFilter the dashboard loaded with.
  const liveFilterRef = useRef<ReturnType<typeof makeFilter> | null>(null);
  const mergeRef = useRef(setStats);
  mergeRef.current = setStats;

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Live per-student patches while a refresh runs.
  useEffect(() => {
    let aggTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleAggregates = () => {
      if (aggTimer) clearTimeout(aggTimer);
      // Debounce so a burst of completions refreshes the KPIs/charts once.
      aggTimer = setTimeout(() => reload(), 900);
    };
    return window.tracker.refresh.onStudentUpdate((studentId) => {
      const f = liveFilterRef.current;
      if (!f) return;
      window.tracker.dashboard
        .stats(f)
        .then((rows) => {
          const patch = rows.find((r) => r.id === studentId);
          if (!patch) return;
          mergeRef.current((prev) => {
            const idx = prev.findIndex((s) => s.id === studentId);
            if (idx === -1) return [...prev, patch];
            const next = prev.slice();
            next[idx] = patch;
            return next;
          });
          scheduleAggregates();
        })
        .catch(() => {});
    });
  }, [cohortId, reload]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        // "All time" needs the earliest stored date, which only the DB knows.
        let resolved = resolveRange(filters.preset, new Date(), filters.custom);
        if (filters.preset === 'all') {
          const earliest = await window.tracker.dashboard.earliestDate(cohortId);
          if (earliest) resolved = { from: earliest, to: resolved.to };
        }

        const filter = makeFilter(filters, cohortId, resolved);
        liveFilterRef.current = filter;

        const [s, st, tr, deps] = await Promise.all([
          window.tracker.dashboard.summary(filter),
          window.tracker.dashboard.stats(filter),
          window.tracker.dashboard.trend(filter, filters.granularity),
          window.tracker.students.departments(cohortId),
        ]);

        if (cancelled) return;
        setRange(resolved);
        setSummary(s);
        setStats(st);
        setTrend(tr);
        setDepartments(deps);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    cohortId,
    filters.preset,
    filters.custom?.from,
    filters.custom?.to,
    filters.granularity,
    filters.search,
    filters.depts.join('|'),
    filters.includeInactive,
    nonce,
  ]);

  return { range, summary, stats, trend, departments, loading, error, reload };
}

/** Closes a popover when the user clicks outside of it or presses Escape. */
export function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return ref;
}
