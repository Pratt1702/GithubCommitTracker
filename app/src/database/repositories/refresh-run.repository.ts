import db from '../sqlite';
import type { RefreshRun } from '../../shared/types';

interface RunRow {
  id: number;
  cohort_id: number | null;
  cohort_name: string | null;
  started_at: string;
  finished_at: string | null;
  students_total: number;
  students_ok: number;
  students_failed: number;
  status: RefreshRun['status'];
}

function map(r: RunRow): RefreshRun {
  return {
    id: r.id,
    cohortId: r.cohort_id,
    cohortName: r.cohort_name,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    studentsTotal: r.students_total,
    studentsOk: r.students_ok,
    studentsFailed: r.students_failed,
    status: r.status,
  };
}

const SELECT = `SELECT r.*, c.name AS cohort_name FROM refresh_runs r
                LEFT JOIN cohorts c ON c.id = r.cohort_id`;

export class RefreshRunRepository {
  start(total: number, cohortId: number | null): number {
    const info = db
      .prepare(`INSERT INTO refresh_runs (students_total, cohort_id) VALUES (?, ?)`)
      .run(total, cohortId);
    return Number(info.lastInsertRowid);
  }

  finish(id: number, ok: number, failed: number, status: RefreshRun['status'] = 'completed'): void {
    db.prepare(
      `UPDATE refresh_runs SET finished_at = datetime('now'), students_ok = ?, students_failed = ?, status = ?
       WHERE id = ?`,
    ).run(ok, failed, status, id);
  }

  /** Most recent finished run, optionally scoped to one cohort. */
  latestCompleted(cohortId?: number): RefreshRun | null {
    const r = (
      cohortId === undefined
        ? db.prepare(`${SELECT} WHERE r.status != 'running' ORDER BY r.id DESC LIMIT 1`).get()
        : db
            .prepare(
              `${SELECT} WHERE r.status != 'running' AND (r.cohort_id = ? OR r.cohort_id IS NULL)
               ORDER BY r.id DESC LIMIT 1`,
            )
            .get(cohortId)
    ) as RunRow | undefined;
    return r ? map(r) : null;
  }

  recent(limit = 30, cohortId?: number): RefreshRun[] {
    const rows = (
      cohortId === undefined
        ? db.prepare(`${SELECT} ORDER BY r.id DESC LIMIT ?`).all(limit)
        : db.prepare(`${SELECT} WHERE r.cohort_id = ? ORDER BY r.id DESC LIMIT ?`).all(cohortId, limit)
    ) as RunRow[];
    return rows.map(map);
  }
}
