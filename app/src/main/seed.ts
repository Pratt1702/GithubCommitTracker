/**
 * Seeds the dev database with REAL GitHub data by driving the same code paths
 * the app uses: the CSV importer, the scraper, the cohort/student repositories
 * and the dashboard aggregation. Run with `npm run seed`.
 *
 * This is a development/verification harness, not a test suite.
 */
import path from 'path';
import { app } from 'electron';
import { initDb, getDbPath } from '../database/sqlite';
import { CohortRepository } from '../database/repositories/cohort.repository';
import { StudentRepository } from '../database/repositories/student.repository';
import { ContributionRepository } from '../database/repositories/contribution.repository';
import { importCsv } from './services/csv.service';
import { runRefresh } from './services/refresh.service';
import { buildSummary } from './services/dashboard.service';
import { resolveRange } from '../shared/dates';
import type { Granularity, RangePreset } from '../shared/types';

const cohorts = new CohortRepository();
const students = new StudentRepository();
const contributions = new ContributionRepository();

async function main() {
  initDb();
  console.log(`DB: ${getDbPath()}\n`);

  // Two cohorts so the home screen and the all-cohorts refresh are exercised.
  const cohortA = cohorts.create({
    name: '2026 Batch — CSE B',
    batch: '2026',
    dept: 'CSE',
    section: 'B',
    notes: 'Open-source elective',
  });
  const cohortB = cohorts.create({
    name: '2027 Batch — ECE A',
    batch: '2027',
    dept: 'ECE',
    section: 'A',
    notes: '',
  });
  console.log(`=== Cohorts created ===\n  #${cohortA} 2026 CSE B\n  #${cohortB} 2027 ECE A\n`);

  const csvA = path.resolve(process.cwd(), 'scripts/sample-roster.csv');
  const importedA = importCsv(cohortA, csvA);
  console.log('=== CSV import (real importer) ===');
  console.log(
    `  cohort A: inserted=${importedA.inserted} updated=${importedA.updated} skipped=${importedA.skipped} rows=${importedA.totalRows}`,
  );
  for (const e of importedA.errors) console.log(`    error: ${e}`);

  // Second cohort gets a couple of students added through the repository path.
  for (const s of [
    { name: 'Andrew Clark', regNo: '27EC004', dept: 'ECE', email: '', link: 'https://github.com/acdlite' },
    { name: 'Ryan Florence', regNo: '27EC011', dept: 'ECE', email: '', link: 'https://github.com/ryanflorence' },
    { name: 'M Karthikeyan Subramanian', regNo: '27EC021', dept: 'ECE', email: '', link: 'https://github.com/karthikm' },
    { name: 'Sai Venkateswara Rao Nandagiri', regNo: '27EC045', dept: 'ECE', email: '', link: 'https://github.com/sairao' },
  ]) {
    students.upsert(cohortB, s);
  }
  console.log(`  cohort B: ${students.count(cohortB)} students added via repository\n`);

  // Re-import to prove idempotency of the importer itself.
  const reimport = importCsv(cohortA, csvA);
  console.log(
    `=== Re-import same CSV (idempotency) ===\n  inserted=${reimport.inserted} (expect 0) updated=${reimport.updated}\n`,
  );

  console.log('=== Refresh: full history, all cohorts (real GitHub scrape) ===');
  const started = Date.now();
  const result = await runRefresh({ mode: 'full' });
  console.log(
    `  ok=${result.ok} failed=${result.failed} total=${result.total} in ${Math.round((Date.now() - started) / 1000)}s\n`,
  );

  // Idempotency at the data layer: re-running must not change stored totals.
  const before = contributions.cohortTotal({ range: resolveRange('all') }, resolveRange('all'));
  await runRefresh({ mode: 'incremental' });
  const after = contributions.cohortTotal({ range: resolveRange('all') }, resolveRange('all'));
  console.log('=== Same-day re-run (the bug the Python script had) ===');
  console.log(`  lifetime total before=${before} after=${after} → ${before === after ? 'STABLE ✓' : 'DRIFTED ✗'}\n`);

  console.log('=== Dashboard summary per preset (cohort A) ===');
  const presets: Array<[RangePreset, Granularity]> = [
    ['28d', 'day'],
    ['3m', 'week'],
    ['6m', 'week'],
    ['ytd', 'month'],
    ['all', 'year'],
  ];
  for (const [preset, g] of presets) {
    let range = resolveRange(preset);
    if (preset === 'all') {
      const earliest = contributions.earliestDate(cohortA);
      if (earliest) range = { from: earliest, to: range.to };
    }
    const s = buildSummary({ range, cohortId: cohortA });
    const t = contributions.trend({ range, cohortId: cohortA }, g);
    console.log(
      `  ${preset.padEnd(4)} ${range.from}→${range.to} window=${String(s.windowTotal).padStart(7)} ` +
        `year=${String(s.yearTotal).padStart(6)} life=${String(s.lifetimeTotal).padStart(7)} ` +
        `avg=${String(s.avgPerStudent).padStart(8)} silent=${s.inactiveInWindow} ` +
        `delta=${s.deltaPct === null ? 'n/a' : `${s.deltaPct}%`} buckets=${t.length}`,
    );
  }

  console.log('\n=== Cohort cards (home screen aggregation) ===');
  for (const c of contributions.cohortSummaries(resolveRange('28d'), 'day')) {
    console.log(
      `  ${c.name.padEnd(22)} students=${String(c.studentCount).padStart(2)} 28d=${String(c.windowTotal).padStart(5)} ` +
        `year=${String(c.yearTotal).padStart(6)} life=${String(c.lifetimeTotal).padStart(7)} ` +
        `avg=${String(c.avgPerStudent).padStart(7)} silent=${c.inactiveInWindow} errors=${c.erroredCount} ` +
        `spark=${c.spark.length}`,
    );
  }

  console.log('\n=== Per-student stats (cohort A, 28-day window) ===');
  const rows = contributions.stats({ range: resolveRange('28d'), cohortId: cohortA });
  console.log('  student              reg        dept   28d   year    life  days  cur/best  lastActive');
  for (const s of rows) {
    console.log(
      `  ${s.name.padEnd(20)} ${(s.regNo || '—').padEnd(10)} ${(s.dept || '—').padEnd(6)} ` +
        `${String(s.windowTotal).padStart(4)} ${String(s.yearTotal).padStart(6)} ${String(s.lifetimeTotal).padStart(7)} ` +
        `${String(s.activeDays).padStart(4)}  ${String(s.currentStreak).padStart(3)}/${String(s.bestStreak).padEnd(3)} ` +
        `${s.lastActiveDate ?? 'never'}${s.lastError ? `  ERR: ${s.lastError}` : ''}`,
    );
  }

  console.log('\n=== Search + department filters ===');
  const cse = contributions.stats({ range: resolveRange('28d'), cohortId: cohortA, depts: ['CSE'] });
  console.log(`  dept CSE in cohort A -> ${cse.length}: ${cse.map((s) => s.name).join(', ')}`);
  const search = contributions.stats({ range: resolveRange('28d'), search: 'ryan' });
  console.log(`  search "ryan" (all cohorts) -> ${search.length}: ${search.map((s) => s.name).join(', ')}`);
  const byReg = contributions.stats({ range: resolveRange('28d'), search: '27EC' });
  console.log(`  search "27EC" (register no) -> ${byReg.length}: ${byReg.map((s) => s.name).join(', ')}`);

  console.log('\nSeed complete.');
  app.exit(0);
}

app.whenReady().then(() =>
  main().catch((err) => {
    console.error('Seed failed:', err);
    app.exit(1);
  }),
);
