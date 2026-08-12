import { ContributionRepository, type StatsFilter } from '../../database/repositories/contribution.repository';
import { StudentRepository } from '../../database/repositories/student.repository';
import { RefreshRunRepository } from '../../database/repositories/refresh-run.repository';
import { previousRange } from '../../shared/dates';
import type { DashboardSummary } from '../../shared/types';

const contributions = new ContributionRepository();
const students = new StudentRepository();
const runs = new RefreshRunRepository();

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 100) / 100;
}

/** Headline KPIs for the selected window, filters and (optional) cohort. */
export function buildSummary(filter: StatsFilter): DashboardSummary {
  const stats = contributions.stats(filter);
  const windowTotals = stats.map((s) => s.windowTotal);
  const windowTotal = windowTotals.reduce((a, b) => a + b, 0);

  const prevTotal = contributions.cohortTotal(filter, previousRange(filter.range));
  const deltaPct =
    prevTotal > 0
      ? Math.round(((windowTotal - prevTotal) / prevTotal) * 1000) / 10
      : windowTotal > 0
        ? null
        : 0;

  const lastRun = runs.latestCompleted(filter.cohortId);

  return {
    studentCount: students.count(filter.cohortId),
    activeStudentCount: stats.filter((s) => s.active === 1).length,
    windowTotal,
    yearTotal: stats.reduce((a, s) => a + s.yearTotal, 0),
    lifetimeTotal: stats.reduce((a, s) => a + s.lifetimeTotal, 0),
    inactiveInWindow: stats.filter((s) => s.windowTotal === 0).length,
    avgPerStudent: stats.length ? Math.round((windowTotal / stats.length) * 100) / 100 : 0,
    medianPerStudent: median(windowTotals),
    deltaPct,
    lastRefreshAt: lastRun?.finishedAt ?? null,
  };
}
