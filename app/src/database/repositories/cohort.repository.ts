import db from '../sqlite';
import type { Cohort, CohortInput } from '../../shared/types';

interface CohortRow {
  id: number;
  name: string;
  batch: string;
  dept: string;
  section: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

function map(r: CohortRow): Cohort {
  return {
    id: r.id,
    name: r.name,
    batch: r.batch,
    dept: r.dept,
    section: r.section,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class CohortRepository {
  getAll(): Cohort[] {
    return (
      db
        .prepare(`SELECT * FROM cohorts ORDER BY batch DESC, name COLLATE NOCASE`)
        .all() as CohortRow[]
    ).map(map);
  }

  getById(id: number): Cohort | null {
    const r = db.prepare(`SELECT * FROM cohorts WHERE id = ?`).get(id) as CohortRow | undefined;
    return r ? map(r) : null;
  }

  create(input: CohortInput): number {
    const name = input.name.trim();
    if (!name) throw new Error('Cohort name is required');

    const clash = db.prepare(`SELECT id FROM cohorts WHERE name = ? COLLATE NOCASE`).get(name);
    if (clash) throw new Error(`A cohort named "${name}" already exists`);

    const info = db
      .prepare(`INSERT INTO cohorts (name, batch, dept, section, notes) VALUES (?, ?, ?, ?, ?)`)
      .run(name, input.batch.trim(), input.dept.trim(), input.section.trim(), input.notes.trim());
    return Number(info.lastInsertRowid);
  }

  update(id: number, input: CohortInput): void {
    const name = input.name.trim();
    if (!name) throw new Error('Cohort name is required');

    const clash = db
      .prepare(`SELECT id FROM cohorts WHERE name = ? COLLATE NOCASE AND id != ?`)
      .get(name, id);
    if (clash) throw new Error(`Another cohort named "${name}" already exists`);

    db.prepare(
      `UPDATE cohorts SET name = ?, batch = ?, dept = ?, section = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(name, input.batch.trim(), input.dept.trim(), input.section.trim(), input.notes.trim(), id);
  }

  /** Deletes the cohort along with its students and their history (cascade). */
  delete(id: number): void {
    db.prepare(`DELETE FROM cohorts WHERE id = ?`).run(id);
  }

  count(): number {
    return (db.prepare(`SELECT COUNT(*) AS c FROM cohorts`).get() as { c: number }).c;
  }
}
