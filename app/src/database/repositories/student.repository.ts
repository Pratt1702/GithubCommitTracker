import db from '../sqlite';
import type { Student, StudentInput, DeptOption } from '../../shared/types';
import { extractUsername } from '../../shared/parsing';

export { extractUsername };

interface StudentRow {
  id: number;
  cohort_id: number;
  name: string;
  reg_no: string;
  email: string;
  dept: string;
  link: string;
  username: string;
  active: number;
  created_at: string;
  updated_at: string;
}

function map(r: StudentRow): Student {
  return {
    id: r.id,
    cohortId: r.cohort_id,
    name: r.name,
    regNo: r.reg_no,
    email: r.email,
    dept: r.dept,
    link: r.link,
    username: r.username,
    active: r.active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class StudentRepository {
  getAll(): Student[] {
    return (
      db.prepare(`SELECT * FROM students ORDER BY name COLLATE NOCASE`).all() as StudentRow[]
    ).map(map);
  }

  getByCohort(cohortId: number): Student[] {
    return (
      db
        .prepare(`SELECT * FROM students WHERE cohort_id = ? ORDER BY name COLLATE NOCASE`)
        .all(cohortId) as StudentRow[]
    ).map(map);
  }

  /** Active students, optionally scoped to one cohort — the refresh cohort. */
  getActive(cohortId?: number): Student[] {
    const rows = (
      cohortId
        ? db
            .prepare(
              `SELECT * FROM students WHERE active = 1 AND cohort_id = ? ORDER BY name COLLATE NOCASE`,
            )
            .all(cohortId)
        : db.prepare(`SELECT * FROM students WHERE active = 1 ORDER BY name COLLATE NOCASE`).all()
    ) as StudentRow[];
    return rows.map(map);
  }

  getById(id: number): Student | null {
    const r = db.prepare(`SELECT * FROM students WHERE id = ?`).get(id) as StudentRow | undefined;
    return r ? map(r) : null;
  }

  /**
   * Inserts or updates a student within a cohort, keyed on the derived GitHub
   * username. Re-importing a roster therefore updates records in place rather
   * than duplicating them or discarding collected history.
   */
  upsert(cohortId: number, input: StudentInput): { id: number; created: boolean } {
    const username = extractUsername(input.link);
    if (!username) throw new Error(`Cannot derive a GitHub username from "${input.link}"`);

    const existing = db
      .prepare(`SELECT id FROM students WHERE cohort_id = ? AND username = ? COLLATE NOCASE`)
      .get(cohortId, username) as { id: number } | undefined;

    if (existing) {
      db.prepare(
        `UPDATE students SET name = ?, reg_no = ?, dept = ?, email = ?, link = ?, updated_at = datetime('now')
         WHERE id = ?`,
      ).run(input.name.trim(), input.regNo.trim(), input.dept.trim(), (input.email ?? '').trim(), input.link.trim(), existing.id);
      return { id: existing.id, created: false };
    }

    const info = db
      .prepare(
        `INSERT INTO students (cohort_id, name, reg_no, dept, email, link, username) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(cohortId, input.name.trim(), input.regNo.trim(), input.dept.trim(), (input.email ?? '').trim(), input.link.trim(), username);
    return { id: Number(info.lastInsertRowid), created: true };
  }

  update(id: number, input: StudentInput): void {
    const current = db.prepare(`SELECT cohort_id, username FROM students WHERE id = ?`).get(id) as
      | { cohort_id: number; username: string }
      | undefined;
    if (!current) throw new Error('Student not found');

    const username = extractUsername(input.link);
    if (!username) throw new Error(`Cannot derive a GitHub username from "${input.link}"`);

    const clash = db
      .prepare(
        `SELECT id FROM students WHERE cohort_id = ? AND username = ? COLLATE NOCASE AND id != ?`,
      )
      .get(current.cohort_id, username, id) as { id: number } | undefined;
    if (clash) throw new Error(`Another student in this cohort already uses "${username}"`);

    db.prepare(
      `UPDATE students SET name = ?, reg_no = ?, dept = ?, email = ?, link = ?, username = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(input.name.trim(), input.regNo.trim(), input.dept.trim(), (input.email ?? '').trim(), input.link.trim(), username, id);

    // Changing the GitHub account invalidates the harvested history.
    if (current.username.toLowerCase() !== username.toLowerCase()) {
      db.prepare(`DELETE FROM contributions WHERE student_id = ?`).run(id);
      db.prepare(`DELETE FROM sync_state WHERE student_id = ?`).run(id);
    }
  }

  setActive(id: number, active: boolean): void {
    db.prepare(`UPDATE students SET active = ?, updated_at = datetime('now') WHERE id = ?`).run(
      active ? 1 : 0,
      id,
    );
  }

  /** Moves a student to another cohort, keeping their collected history. */
  moveToCohort(id: number, cohortId: number): void {
    const s = db.prepare(`SELECT username FROM students WHERE id = ?`).get(id) as
      | { username: string }
      | undefined;
    if (!s) throw new Error('Student not found');

    const clash = db
      .prepare(`SELECT id FROM students WHERE cohort_id = ? AND username = ? COLLATE NOCASE`)
      .get(cohortId, s.username);
    if (clash) throw new Error(`That cohort already contains "${s.username}"`);

    db.prepare(`UPDATE students SET cohort_id = ?, updated_at = datetime('now') WHERE id = ?`).run(
      cohortId,
      id,
    );
  }

  delete(id: number): void {
    db.prepare(`DELETE FROM students WHERE id = ?`).run(id);
  }

  deleteByCohort(cohortId: number): void {
    db.prepare(`DELETE FROM students WHERE cohort_id = ?`).run(cohortId);
  }

  count(cohortId?: number): number {
    const r = cohortId
      ? db.prepare(`SELECT COUNT(*) AS c FROM students WHERE cohort_id = ?`).get(cohortId)
      : db.prepare(`SELECT COUNT(*) AS c FROM students`).get();
    return (r as { c: number }).c;
  }

  /** Distinct departments within a cohort (or globally), for the filter dropdown. */
  departments(cohortId?: number): DeptOption[] {
    const sql = `SELECT CASE WHEN dept = '' THEN 'Unassigned' ELSE dept END AS dept, COUNT(*) AS count
                 FROM students ${cohortId ? 'WHERE cohort_id = ?' : ''}
                 GROUP BY dept ORDER BY dept COLLATE NOCASE`;
    return (cohortId ? db.prepare(sql).all(cohortId) : db.prepare(sql).all()) as DeptOption[];
  }
}
