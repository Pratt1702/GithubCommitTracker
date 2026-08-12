import db from '../sqlite';
import type { CohortSummary, DateRange, Granularity, StudentStats, TrendPoint } from '../../shared/types';
import { addDays, bucketKey, bucketLabel, daysBetween, enumerateBuckets } from '../../shared/dates';
import { streaks } from '../../shared/streaks';

export { streaks };

export interface DayCount {
  date: string;
  count: number;
}

export interface StatsFilter {
  range: DateRange;
  /** Scope to a single cohort. Omit for an all-cohorts view. */
  cohortId?: number;
  /** Restrict to these departments (raw dept values). Empty/undefined = all. */
  depts?: string[];
  /** Case-insensitive substring match on name / username / dept / register number. */
  search?: string;
  /** Include students flagged archived. */
  includeInactive?: boolean;
}

export class ContributionRepository {
  /**
   * Replaces a student's contributions for the given year with absolute values.
   * Idempotent: running twice on the same day yields identical stored numbers.
   * Zero days are not stored (they are implied), and the whole-year delete
   * ensures a corrected/removed commit is reflected rather than lingering.
   */
  replaceYear(studentId: number, year: number, days: DayCount[]): void {
    const tx = db.transaction((rows: DayCount[]) => {
      db.prepare(`DELETE FROM contributions WHERE student_id = ? AND date LIKE ?`).run(
        studentId,
        `${year}-%`,
      );
      const ins = db.prepare(
        `INSERT INTO contributions (student_id, date, count) VALUES (?, ?, ?)
         ON CONFLICT(student_id, date) DO UPDATE SET count = excluded.count`,
      );
      for (const r of rows) {
        if (r.count > 0) ins.run(studentId, r.date, r.count);
      }
    });
    tx(days);
  }

  markSynced(studentId: number, error: string | null): void {
    db.prepare(
      `INSERT INTO sync_state (student_id, last_synced_at, last_error)
       VALUES (?, CASE WHEN ? IS NULL THEN datetime('now') ELSE NULL END, ?)
       ON CONFLICT(student_id) DO UPDATE SET
         last_synced_at = CASE WHEN excluded.last_error IS NULL
                               THEN datetime('now') ELSE sync_state.last_synced_at END,
         last_error     = excluded.last_error`,
    ).run(studentId, error, error);
  }

  /** Earliest contribution date on record, used by the "All time" preset. */
  earliestDate(cohortId?: number): string | null {
    const r = (
      cohortId
        ? db
            .prepare(
              `SELECT MIN(c.date) AS d FROM contributions c
               JOIN students s ON s.id = c.student_id WHERE s.cohort_id = ?`,
            )
            .get(cohortId)
        : db.prepare(`SELECT MIN(date) AS d FROM contributions`).get()
    ) as { d: string | null };
    return r.d;
  }

  /** Builds the WHERE clause shared by the stats and trend queries. */
  private buildWhere(filter: StatsFilter): { sql: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filter.cohortId !== undefined) {
      where.push('s.cohort_id = ?');
      params.push(filter.cohortId);
    }
    if (!filter.includeInactive) where.push('s.active = 1');
    if (filter.depts && filter.depts.length) {
      where.push(`s.dept IN (${filter.depts.map(() => '?').join(',')})`);
      params.push(...filter.depts);
    }
    if (filter.search && filter.search.trim()) {
      where.push(
        `(s.name LIKE ? COLLATE NOCASE OR s.username LIKE ? COLLATE NOCASE
          OR s.dept LIKE ? COLLATE NOCASE OR s.reg_no LIKE ? COLLATE NOCASE)`,
      );
      const like = `%${filter.search.trim()}%`;
      params.push(like, like, like, like);
    }

    return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  /** Per-student aggregates for the table. */
  stats(filter: StatsFilter, restrictIds?: number[]): StudentStats[] {
    const { range } = filter;
    const year = new Date().getFullYear();
    const { sql: whereSql, params } = this.buildWhere(filter);

    const idClause = restrictIds && restrictIds.length ? ` AND s.id IN (${restrictIds.map(() => '?').join(',')})` : '';

    const students = db
      .prepare(
        `SELECT s.id, s.cohort_id, s.name, s.reg_no, s.email, s.dept, s.link, s.username, s.active,
                ss.last_synced_at AS lastSyncedAt, ss.last_error AS lastError
         FROM students s LEFT JOIN sync_state ss ON ss.student_id = s.id
         ${whereSql}${idClause}
         ORDER BY s.name COLLATE NOCASE`,
      )
      .all(...params, ...(restrictIds ?? [])) as Array<{
      id: number;
      cohort_id: number;
      name: string;
      reg_no: string;
      email: string;
      dept: string;
      link: string;
      username: string;
      active: number;
      lastSyncedAt: string | null;
      lastError: string | null;
    }>;

    if (!students.length) return [];

    const ids = students.map((s) => s.id);
    const ph = ids.map(() => '?').join(',');

    const windowRows = db
      .prepare(
        `SELECT student_id, date, count FROM contributions
         WHERE student_id IN (${ph}) AND date BETWEEN ? AND ? AND count > 0
         ORDER BY student_id, date`,
      )
      .all(...ids, range.from, range.to) as Array<{ student_id: number; date: string; count: number }>;

    const totals = db
      .prepare(
        `SELECT student_id,
                SUM(count) AS lifetime,
                SUM(CASE WHEN date LIKE ? THEN count ELSE 0 END) AS yearTotal,
                MAX(date) AS lastActive
         FROM contributions WHERE student_id IN (${ph}) GROUP BY student_id`,
      )
      .all(`${year}-%`, ...ids) as Array<{
      student_id: number;
      lifetime: number;
      yearTotal: number;
      lastActive: string | null;
    }>;

    const totalsById = new Map(totals.map((t) => [t.student_id, t]));
    const daysById = new Map<number, string[]>();
    const sumById = new Map<number, number>();
    for (const r of windowRows) {
      if (!daysById.has(r.student_id)) daysById.set(r.student_id, []);
      daysById.get(r.student_id)!.push(r.date);
      sumById.set(r.student_id, (sumById.get(r.student_id) ?? 0) + r.count);
    }

    const windowLen = Math.max(1, daysBetween(range.from, range.to));

    return students.map((s) => {
      const days = daysById.get(s.id) ?? [];
      const t = totalsById.get(s.id);
      const windowTotal = sumById.get(s.id) ?? 0;
      const { best, current } = streaks(days, range.to);
      return {
        id: s.id,
        cohortId: s.cohort_id,
        name: s.name,
        regNo: s.reg_no,
        email: s.email,
        dept: s.dept,
        link: s.link,
        username: s.username,
        active: s.active,
        windowTotal,
        yearTotal: t?.yearTotal ?? 0,
        lifetimeTotal: t?.lifetime ?? 0,
        activeDays: days.length,
        bestStreak: best,
        currentStreak: current,
        avgPerDay: Math.round((windowTotal / windowLen) * 100) / 100,
        lastActiveDate: t?.lastActive ?? null,
        lastSyncedAt: s.lastSyncedAt,
        lastError: s.lastError,
      };
    });
  }

  /** Aggregate trend across the filtered cohort, gap-filled so charts don't lie. */
  trend(filter: StatsFilter, granularity: Granularity): TrendPoint[] {
    const { sql: whereSql, params } = this.buildWhere(filter);
    const buckets = enumerateBuckets(filter.range, granularity);
    const totals = new Map<string, number>(buckets.map((b) => [b, 0]));
    const actives = new Map<string, Set<number>>(buckets.map((b) => [b, new Set<number>()]));

    const rows = db
      .prepare(
        `SELECT c.student_id, c.date, c.count FROM contributions c
         JOIN students s ON s.id = c.student_id
         ${whereSql ? `${whereSql} AND` : 'WHERE'} c.date BETWEEN ? AND ? AND c.count > 0`,
      )
      .all(...params, filter.range.from, filter.range.to) as Array<{
      student_id: number;
      date: string;
      count: number;
    }>;

    for (const r of rows) {
      const key = bucketKey(r.date, granularity);
      if (!totals.has(key)) {
        totals.set(key, 0);
        actives.set(key, new Set<number>());
      }
      totals.set(key, totals.get(key)! + r.count);
      actives.get(key)!.add(r.student_id);
    }

    return buckets.map((b) => ({
      bucket: b,
      label: bucketLabel(b, granularity),
      total: totals.get(b) ?? 0,
      activeStudents: actives.get(b)?.size ?? 0,
    }));
  }

  /** Daily series for one student, gap-filled with zeros for the heatmap. */
  studentSeries(studentId: number, range: DateRange): DayCount[] {
    const rows = db
      .prepare(
        `SELECT date, count FROM contributions WHERE student_id = ? AND date BETWEEN ? AND ? ORDER BY date`,
      )
      .all(studentId, range.from, range.to) as DayCount[];
    const byDate = new Map(rows.map((r) => [r.date, r.count]));
    const out: DayCount[] = [];
    let cur = range.from;
    let guard = 0;
    while (cur <= range.to && guard++ < 20_000) {
      out.push({ date: cur, count: byDate.get(cur) ?? 0 });
      cur = addDays(cur, 1);
    }
    return out;
  }

  /** Sum of contributions across the filtered cohort inside an arbitrary range. */
  cohortTotal(filter: StatsFilter, range: DateRange): number {
    const { sql: whereSql, params } = this.buildWhere({ ...filter, range });
    const r = db
      .prepare(
        `SELECT COALESCE(SUM(c.count), 0) AS total FROM contributions c
         JOIN students s ON s.id = c.student_id
         ${whereSql ? `${whereSql} AND` : 'WHERE'} c.date BETWEEN ? AND ?`,
      )
      .get(...params, range.from, range.to) as { total: number };
    return r.total;
  }

  /**
   * Roll-up cards for the home screen: one row per cohort with window/year/
   * lifetime totals plus a small sparkline series.
   */
  cohortSummaries(range: DateRange, granularity: Granularity): CohortSummary[] {
    const cohorts = db.prepare(`SELECT * FROM cohorts ORDER BY batch DESC, name COLLATE NOCASE`).all() as Array<{
      id: number;
      name: string;
      batch: string;
      dept: string;
      section: string;
      notes: string;
      created_at: string;
      updated_at: string;
    }>;

    const year = new Date().getFullYear();
    const buckets = enumerateBuckets(range, granularity);

    return cohorts.map((c) => {
      const counts = db
        .prepare(
          `SELECT COUNT(*) AS total, COALESCE(SUM(active), 0) AS active FROM students WHERE cohort_id = ?`,
        )
        .get(c.id) as { total: number; active: number };

      const agg = db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN co.date BETWEEN ? AND ? THEN co.count ELSE 0 END), 0) AS windowTotal,
             COALESCE(SUM(CASE WHEN co.date LIKE ? THEN co.count ELSE 0 END), 0) AS yearTotal,
             COALESCE(SUM(co.count), 0) AS lifetimeTotal
           FROM students s LEFT JOIN contributions co ON co.student_id = s.id
           WHERE s.cohort_id = ? AND s.active = 1`,
        )
        .get(range.from, range.to, `${year}-%`, c.id) as {
        windowTotal: number;
        yearTotal: number;
        lifetimeTotal: number;
      };

      const silent = db
        .prepare(
          `SELECT COUNT(*) AS c FROM students s
           WHERE s.cohort_id = ? AND s.active = 1
             AND NOT EXISTS (SELECT 1 FROM contributions co
                             WHERE co.student_id = s.id AND co.date BETWEEN ? AND ? AND co.count > 0)`,
        )
        .get(c.id, range.from, range.to) as { c: number };

      const sync = db
        .prepare(
          `SELECT MAX(ss.last_synced_at) AS lastSyncedAt,
                  COALESCE(SUM(CASE WHEN ss.last_error IS NOT NULL THEN 1 ELSE 0 END), 0) AS errored
           FROM students s LEFT JOIN sync_state ss ON ss.student_id = s.id
           WHERE s.cohort_id = ?`,
        )
        .get(c.id) as { lastSyncedAt: string | null; errored: number };

      const sparkRows = db
        .prepare(
          `SELECT co.date, SUM(co.count) AS total FROM contributions co
           JOIN students s ON s.id = co.student_id
           WHERE s.cohort_id = ? AND s.active = 1 AND co.date BETWEEN ? AND ?
           GROUP BY co.date`,
        )
        .all(c.id, range.from, range.to) as Array<{ date: string; total: number }>;

      const sparkMap = new Map<string, number>(buckets.map((b) => [b, 0]));
      for (const r of sparkRows) {
        const k = bucketKey(r.date, granularity);
        if (sparkMap.has(k)) sparkMap.set(k, sparkMap.get(k)! + r.total);
      }

      const activeCount = Number(counts.active);

      return {
        id: c.id,
        name: c.name,
        batch: c.batch,
        dept: c.dept,
        section: c.section,
        notes: c.notes,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        studentCount: counts.total,
        activeStudentCount: activeCount,
        windowTotal: agg.windowTotal,
        yearTotal: agg.yearTotal,
        lifetimeTotal: agg.lifetimeTotal,
        avgPerStudent: activeCount ? Math.round((agg.windowTotal / activeCount) * 10) / 10 : 0,
        inactiveInWindow: silent.c,
        erroredCount: Number(sync.errored),
        lastSyncedAt: sync.lastSyncedAt,
        spark: buckets.map((b) => sparkMap.get(b) ?? 0),
      };
    });
  }
}
