/**
 * Integration verification, run inside Electron so better-sqlite3 loads with
 * the ABI it was built for:  npm run verify
 *
 * Exercises the real DB layer against a throwaway database: cohort CRUD and
 * cascade, per-cohort scoping, register-number search, the migration path from
 * a v1 database, and the idempotency guarantee that replaces the Python
 * script's diff bug. This is an ad-hoc harness, not a CI suite.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app } = require('electron');

const DB = path.join(os.tmpdir(), `ct-verify-${Date.now()}.db`);
process.env.COMMITTRACKER_DB = DB;
process.chdir(os.tmpdir());

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n          got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

function throws(label, fn) {
  try {
    fn();
    console.log(`  FAIL  ${label} (expected it to throw)`);
    fail++;
  } catch {
    console.log(`  PASS  ${label}`);
    pass++;
  }
}

async function main() {
  const dist = path.resolve(__dirname, '../dist-electron/verify');
  const { initDb } = require(path.join(dist, 'sqlite.cjs'));
  const { CohortRepository } = require(path.join(dist, 'cohort.repository.cjs'));
  const { StudentRepository } = require(path.join(dist, 'student.repository.cjs'));
  const { ContributionRepository } = require(path.join(dist, 'contribution.repository.cjs'));
  const db = require(path.join(dist, 'sqlite.cjs')).default;

  initDb();
  const cohorts = new CohortRepository();
  const students = new StudentRepository();
  const contributions = new ContributionRepository();

  console.log('\n=== Cohorts ===');
  const a = cohorts.create({ name: '2026 CSE B', batch: '2026', dept: 'CSE', section: 'B', notes: '' });
  const b = cohorts.create({ name: '2027 ECE A', batch: '2027', dept: 'ECE', section: 'A', notes: '' });
  check('two cohorts created', cohorts.count(), 2);
  check('ordered by batch desc', cohorts.getAll().map((c) => c.name), ['2027 ECE A', '2026 CSE B']);
  throws('duplicate cohort name rejected', () => cohorts.create({ name: '2026 cse b', batch: '', dept: '', section: '', notes: '' }));

  console.log('\n=== Students & register numbers ===');
  const s1 = students.upsert(a, { name: 'Asha R', regNo: '26CS001', dept: 'CSE', email: 'asha@clg.edu', link: 'https://github.com/asha' });
  const s2 = students.upsert(a, { name: 'Bala K', regNo: '26CS002', dept: 'CSE', email: 'bala@clg.edu', link: 'github.com/bala' });
  const s3 = students.upsert(b, { name: 'Chitra M', regNo: '27EC001', dept: 'ECE', email: '', link: '@chitra' });
  check('inserted three students', [s1.created, s2.created, s3.created], [true, true, true]);
  check('reg no persisted', students.getById(s1.id).regNo, '26CS001');
  check('email persisted', students.getById(s1.id).email, 'asha@clg.edu');
  check('empty email allowed (optional field)', students.getById(s3.id).email, '');
  check('username derived from bare handle', students.getById(s3.id).username, 'chitra');
  check('cohort A has 2', students.count(a), 2);
  check('cohort B has 1', students.count(b), 1);

  const again = students.upsert(a, { name: 'Asha Raman', regNo: '26CS001', dept: 'CSE', link: 'https://github.com/asha' });
  check('re-upsert updates in place, no duplicate', [again.created, students.count(a)], [false, 2]);
  check('name updated by upsert', students.getById(s1.id).name, 'Asha Raman');

  // Same GitHub account is allowed in a different cohort.
  const dup = students.upsert(b, { name: 'Asha Raman', regNo: '26CS001', dept: 'CSE', link: 'https://github.com/asha' });
  check('same account allowed in another cohort', dup.created, true);

  console.log('\n=== Idempotency (the Python script bug) ===');
  const year = 2026;
  const days = [
    { date: `${year}-08-01`, count: 5 },
    { date: `${year}-08-02`, count: 3 },
    { date: `${year}-08-03`, count: 0 },
    { date: `${year}-08-04`, count: 12 },
  ];
  contributions.replaceYear(s1.id, year, days);
  const range = { from: `${year}-08-01`, to: `${year}-08-31` };
  const first = contributions.stats({ range, cohortId: a }).find((s) => s.id === s1.id).windowTotal;
  contributions.replaceYear(s1.id, year, days);
  contributions.replaceYear(s1.id, year, days);
  const third = contributions.stats({ range, cohortId: a }).find((s) => s.id === s1.id).windowTotal;
  check('sum after 1 run', first, 20);
  check('sum unchanged after 3 identical runs', third, 20);

  // A corrected (lower) day must overwrite, not accumulate or subtract.
  contributions.replaceYear(s1.id, year, [{ date: `${year}-08-01`, count: 1 }]);
  const corrected = contributions.stats({ range, cohortId: a }).find((s) => s.id === s1.id);
  check('whole-year replace reflects removed days', corrected.windowTotal, 1);
  check('zero-count days are not stored', corrected.activeDays, 1);

  console.log('\n=== Scoping, search, filters ===');
  contributions.replaceYear(s2.id, year, [{ date: `${year}-08-05`, count: 7 }]);
  contributions.replaceYear(s3.id, year, [{ date: `${year}-08-05`, count: 100 }]);
  check('cohort A total excludes cohort B', contributions.cohortTotal({ range, cohortId: a }, range), 8);
  check('cohort B total isolated', contributions.cohortTotal({ range, cohortId: b }, range), 100);
  check('all-cohorts total sums both', contributions.cohortTotal({ range }, range), 108);
  check(
    'search by register number',
    contributions.stats({ range, search: '26CS002' }).map((s) => s.name),
    ['Bala K'],
  );
  check(
    'search by name is case-insensitive',
    contributions.stats({ range, cohortId: a, search: 'asha' }).map((s) => s.regNo),
    ['26CS001'],
  );
  check('dept filter', contributions.stats({ range, depts: ['ECE'] }).length, 1);
  students.setActive(s2.id, false);
  check('archived excluded by default', contributions.stats({ range, cohortId: a }).length, 1);
  check('archived included on request', contributions.stats({ range, cohortId: a, includeInactive: true }).length, 2);
  students.setActive(s2.id, true);

  console.log('\n=== Cohort summary cards ===');
  const cards = contributions.cohortSummaries(range, 'day');
  const cardA = cards.find((c) => c.id === a);
  check('card student count', cardA.studentCount, 2);
  check('card window total', cardA.windowTotal, 8);
  check('card spark length matches day buckets', cardA.spark.length, 31);
  check('spark sums to window total', cardA.spark.reduce((x, y) => x + y, 0), 8);

  console.log('\n=== Trend gap-filling ===');
  const trend = contributions.trend({ range, cohortId: a }, 'day');
  check('every day present', trend.length, 31);
  check('trend sums to window total', trend.reduce((x, t) => x + t.total, 0), 8);
  const monthly = contributions.trend({ range: { from: '2026-01-01', to: '2026-08-31' }, cohortId: a }, 'month');
  check('monthly buckets gap-filled', monthly.map((m) => m.bucket), ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08']);

  console.log('\n=== Sync state ===');
  contributions.markSynced(s1.id, 'GitHub profile not found (asha)');
  let row = contributions.stats({ range, cohortId: a }).find((s) => s.id === s1.id);
  check('error recorded', row.lastError, 'GitHub profile not found (asha)');
  check('no success timestamp on failure', row.lastSyncedAt, null);
  contributions.markSynced(s1.id, null);
  row = contributions.stats({ range, cohortId: a }).find((s) => s.id === s1.id);
  check('error cleared on success', row.lastError, null);
  check('success timestamp set', typeof row.lastSyncedAt, 'string');

  const { exportCustomCsv } = require(path.join(dist, 'csv.service.cjs'));

  console.log('\n=== Customizable export (columns + scope + inactive flag) ===');
  // A student with no contributions in the window — should flag YES.
  const s4 = students.upsert(a, { name: 'Deepa N', regNo: '26CS004', dept: 'CSE', link: 'https://github.com/deepa' });
  const allRows = contributions.stats({ range, cohortId: a, includeInactive: true });
  const exportFile = path.join(os.tmpdir(), `ct-export-${Date.now()}.csv`);

  // 1) Column selection: only Name + window-total + inactive flag.
  const subsetCols = ['name', 'windowTotal', 'inactiveFlag'];
  exportCustomCsv(exportFile, allRows, {
    range,
    windowLabel: 'Last 28 days',
    scope: 'both',
    depts: [],
    search: '',
    columns: subsetCols,
  });
  const subsetLines = fs.readFileSync(exportFile, 'utf8').trim().split('\n');
  check('subset header has exactly the chosen columns', subsetLines[0], 'Name,Contributions (Last 28 days),Inactive in window?');
  check('subset has one row per student in cohort A', subsetLines.length, allRows.length + 1);
  const ashaRow = subsetLines.find((l) => l.startsWith('Asha'));
  check('asha flagged NO (has contributions)', /NO$/.test(ashaRow), true);
  const deepaRow = subsetLines.find((l) => l.startsWith('Deepa'));
  check('deepa flagged YES (zero contributions in window)', /YES$/.test(deepaRow), true);

  // 2) Scope filters rows: active-only excludes archived students.
  const activeOnly = allRows.filter((s) => s.active === 1);
  exportCustomCsv(exportFile, activeOnly, {
    range,
    windowLabel: 'Last 28 days',
    scope: 'active',
    depts: [],
    search: '',
    columns: ['name'],
  });
  const activeLines = fs.readFileSync(exportFile, 'utf8').trim().split('\n');
  check('active-only export drops archived student', activeLines.length, activeOnly.length + 1);
  students.delete(s4.id);
  try { fs.unlinkSync(exportFile); } catch {}

  students.update(s1.id, { name: 'Asha Raman', regNo: '26CS001', dept: 'CSE', link: 'https://github.com/asha-new' });
  check('history dropped after account change', contributions.cohortTotal({ range, cohortId: a }, range), 7);
  throws('duplicate username within cohort rejected', () =>
    students.update(s1.id, { name: 'x', regNo: '', dept: '', link: 'https://github.com/bala' }),
  );

  console.log('\n=== Cascade delete ===');
  const before = db.prepare('SELECT COUNT(*) AS c FROM contributions').get().c;
  cohorts.delete(b);
  check('cohort gone', cohorts.count(), 1);
  check('its students gone', students.count(), 2);
  check('its contributions gone', db.prepare('SELECT COUNT(*) AS c FROM contributions').get().c < before, true);

  console.log('\n=== Migration from a v1 (pre-cohort) database ===');
  db.close();
  const legacyPath = path.join(os.tmpdir(), `ct-legacy-${Date.now()}.db`);
  const Database = require(path.join(dist, 'sqlite.cjs')) && require('better-sqlite3');
  const legacy = new Database(legacyPath);
  legacy.exec(`
    CREATE TABLE cohorts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      batch TEXT NOT NULL DEFAULT '', dept TEXT NOT NULL DEFAULT '', section TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE students (id INTEGER PRIMARY KEY AUTOINCREMENT, cohort_id INTEGER NOT NULL,
      name TEXT NOT NULL, dept TEXT NOT NULL DEFAULT '', link TEXT NOT NULL, username TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE refresh_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT, students_total INTEGER NOT NULL DEFAULT 0, students_ok INTEGER NOT NULL DEFAULT 0,
      students_failed INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'running');
    INSERT INTO cohorts (name) VALUES ('legacy');
    INSERT INTO students (cohort_id, name, link, username) VALUES (1, 'Old Student', 'https://github.com/old', 'old');
  `);
  const legacyCols = () => legacy.prepare('PRAGMA table_info(students)').all().map((r) => r.name);
  check('v1 db lacks reg_no', legacyCols().includes('reg_no'), false);
  legacy.close();

  // Re-open through our own initDb, which must migrate it in place.
  const child = require('child_process').spawnSync(
    process.execPath,
    ['-e', `process.env.COMMITTRACKER_DB=${JSON.stringify(legacyPath)};const{initDb}=require(${JSON.stringify(path.join(dist, 'sqlite.cjs'))});initDb();const db=require(${JSON.stringify(path.join(dist, 'sqlite.cjs'))}).default;const cols=db.prepare('PRAGMA table_info(students)').all().map(r=>r.name);const rc=db.prepare('PRAGMA table_info(refresh_runs)').all().map(r=>r.name);console.log(JSON.stringify({cols,rc,kept:db.prepare('SELECT name FROM students').get().name}));`],
    { encoding: 'utf8', env: { ...process.env, COMMITTRACKER_DB: legacyPath, ELECTRON_RUN_AS_NODE: '1' }, cwd: os.tmpdir() },
  );
  const out = (child.stdout || '').trim().split('\n').pop();
  try {
    const parsed = JSON.parse(out);
    check('migration added students.reg_no', parsed.cols.includes('reg_no'), true);
    check('migration added students.email', parsed.cols.includes('email'), true);
    check('migration added refresh_runs.cohort_id', parsed.rc.includes('cohort_id'), true);
    check('existing rows preserved', parsed.kept, 'Old Student');
  } catch {
    console.log(`  FAIL  migration probe could not run: ${child.stderr || out}`);
    fail++;
  }

  for (const f of [DB, `${DB}-wal`, `${DB}-shm`, legacyPath, `${legacyPath}-wal`, `${legacyPath}-shm`]) {
    try { fs.unlinkSync(f); } catch {}
  }

  console.log(`\n${pass} passed, ${fail} failed  (ad-hoc integration harness, not a CI suite)\n`);
  app.exit(fail ? 1 : 0);
}

app.whenReady().then(() =>
  main().catch((err) => {
    console.error('verify crashed:', err);
    app.exit(1);
  }),
);
