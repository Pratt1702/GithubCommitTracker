import fs from 'fs';
import log from 'electron-log';
import { StudentRepository } from '../../database/repositories/student.repository';
import { ContributionRepository } from '../../database/repositories/contribution.repository';
import { extractUsername, parseCsv } from '../../shared/parsing';
import type { ExportColumnKey, ExportOptions, ImportResult, StudentStats } from '../../shared/types';

export { parseCsv };

const students = new StudentRepository();
const contributions = new ContributionRepository();

/** Header aliases so faculty spreadsheets don't have to match exactly. */
const NAME_KEYS = ['name', 'student name', 'student', 'fullname', 'full name'];
const DEPT_KEYS = ['dept', 'department', 'branch', 'stream'];
const LINK_KEYS = ['link', 'github', 'github link', 'github url', 'url', 'profile', 'github profile', 'username'];
const REG_KEYS = ['reg no', 'regno', 'reg_no', 'register number', 'register no', 'roll no', 'rollno', 'roll number', 'registration number', 'reg'];
const EMAIL_KEYS = ['email', 'e-mail', 'mail', 'email address', 'mail id', 'student email'];

function indexOfHeader(headers: string[], keys: string[]): number {
  const norm = headers.map((h) => h.trim().toLowerCase());
  for (const k of keys) {
    const i = norm.indexOf(k);
    if (i !== -1) return i;
  }
  // Fall back to a substring match (e.g. "GitHub Link (public)").
  for (const k of keys) {
    const i = norm.findIndex((h) => h.includes(k));
    if (i !== -1) return i;
  }
  return -1;
}

export interface ColumnMap {
  name: number;
  regNo: number;
  email: number;
  dept: number;
  link: number;
}

export interface CsvPreview {
  headers: string[];
  rows: string[][];
  detected: ColumnMap;
  totalRows: number;
}

/** Reads a CSV and reports what the importer would do, before any writes. */
export function previewCsv(filePath: string): CsvPreview {
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
  if (!rows.length) throw new Error('The CSV file is empty');
  const headers = rows[0].map((h) => h.trim());
  return {
    headers,
    rows: rows.slice(1, 11),
    detected: {
      name: indexOfHeader(headers, NAME_KEYS),
      regNo: indexOfHeader(headers, REG_KEYS),
      email: indexOfHeader(headers, EMAIL_KEYS),
      dept: indexOfHeader(headers, DEPT_KEYS),
      link: indexOfHeader(headers, LINK_KEYS),
    },
    totalRows: rows.length - 1,
  };
}

export interface ImportOptions {
  /** Explicit column indexes; omit to auto-detect from headers. */
  columns?: ColumnMap;
  /** Remove students in this cohort that are absent from the CSV (destructive). */
  replaceAll?: boolean;
}

/**
 * Imports (upserts) students into a cohort from a CSV.
 * Keyed on the derived GitHub username within that cohort, so re-importing an
 * updated roster never duplicates a student or loses their harvested history.
 */
export function importCsv(
  cohortId: number,
  filePath: string,
  options: ImportOptions = {},
): ImportResult & { newIds: number[] } {
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
  if (rows.length < 2) throw new Error('The CSV file has no data rows');

  const headers = rows[0].map((h) => h.trim());
  const cols: ColumnMap =
    options.columns ??
    {
      name: indexOfHeader(headers, NAME_KEYS),
      regNo: indexOfHeader(headers, REG_KEYS),
      email: indexOfHeader(headers, EMAIL_KEYS),
      dept: indexOfHeader(headers, DEPT_KEYS),
      link: indexOfHeader(headers, LINK_KEYS),
    };

  if (cols.name < 0) throw new Error(`Could not find a Name column. Headers found: ${headers.join(', ')}`);
  if (cols.link < 0)
    throw new Error(`Could not find a GitHub Link column. Headers found: ${headers.join(', ')}`);

  const result: ImportResult & { newIds: number[] } = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    totalRows: rows.length - 1,
    newIds: [],
  };

  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
  const seenUsernames = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = cell(r, cols.name);
    const regNo = cell(r, cols.regNo);
    const email = cell(r, cols.email);
    const dept = cell(r, cols.dept);
    const link = cell(r, cols.link);

    if (!name && !link) {
      result.skipped++;
      continue;
    }
    if (!link) {
      result.skipped++;
      result.errors.push(`Row ${i + 1} (${name || 'unnamed'}): missing GitHub link`);
      continue;
    }

    const username = extractUsername(link);
    if (!username) {
      result.skipped++;
      result.errors.push(`Row ${i + 1} (${name || 'unnamed'}): cannot read a username from "${link}"`);
      continue;
    }
    if (seenUsernames.has(username.toLowerCase())) {
      result.skipped++;
      result.errors.push(`Row ${i + 1}: duplicate GitHub account "${username}" in this file`);
      continue;
    }
    seenUsernames.add(username.toLowerCase());

    try {
      const normalizedLink = /^https?:\/\//i.test(link) ? link : `https://github.com/${username}`;
      const { id, created } = students.upsert(cohortId, {
        name: name || username,
        regNo,
        email,
        dept,
        link: normalizedLink,
      });
      if (created) {
        result.inserted++;
        result.newIds.push(id);
      } else {
        result.updated++;
      }
    } catch (err) {
      result.skipped++;
      result.errors.push(`Row ${i + 1} (${name}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (options.replaceAll) {
    const stale = students.getByCohort(cohortId).filter((s) => !seenUsernames.has(s.username.toLowerCase()));
    for (const s of stale) students.delete(s.id);
    log.info(`Import replaceAll removed ${stale.length} students absent from the CSV`);
  }

  log.info(`CSV import: +${result.inserted} new, ${result.updated} updated, ${result.skipped} skipped`);
  return result;
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Exports the currently visible table (already filtered/sorted by the renderer). */
export function exportStatsCsv(filePath: string, stats: StudentStats[], windowLabel: string): void {
  const header = [
    'Name',
    'Register No',
    'Email',
    'Dept',
    'GitHub',
    'Link',
    `Contributions (${windowLabel})`,
    'This Year',
    'Lifetime',
    'Active Days',
    'Avg/Day',
    'Current Streak',
    'Best Streak',
    'Last Active',
    'Last Synced',
    'Error',
  ];
  const lines = [header.join(',')];
  for (const s of stats) {
    lines.push(
      [
        s.name,
        s.regNo,
        s.email,
        s.dept,
        s.username,
        s.link,
        s.windowTotal,
        s.yearTotal,
        s.lifetimeTotal,
        s.activeDays,
        s.avgPerDay,
        s.currentStreak,
        s.bestStreak,
        s.lastActiveDate ?? '',
        s.lastSyncedAt ?? '',
        s.lastError ?? '',
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

/** Exports the raw per-day matrix, for faculty who want the numbers in Excel. */
export function exportDailyCsv(filePath: string, cohortId: number | undefined, from: string, to: string): void {
  const roster = cohortId === undefined ? students.getAll() : students.getByCohort(cohortId);
  const lines = [['Name', 'Register No', 'Dept', 'GitHub', 'Date', 'Contributions'].join(',')];
  for (const s of roster) {
    for (const d of contributions.studentSeries(s.id, { from, to })) {
      if (d.count > 0) {
        lines.push([s.name, s.regNo, s.dept, s.username, d.date, d.count].map(csvEscape).join(','));
      }
    }
  }
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

/** Header label for each optional export column. */
const COLUMN_LABELS: Record<ExportColumnKey, (windowLabel: string) => string> = {
  name: () => 'Name',
  regNo: () => 'Register No',
  email: () => 'Email',
  dept: () => 'Department',
  username: () => 'GitHub',
  link: () => 'Profile link',
  windowTotal: (w) => `Contributions (${w})`,
  yearTotal: () => 'Contributions (This year)',
  lifetimeTotal: () => 'Contributions (Lifetime)',
  activeDays: () => 'Active days (window)',
  avgPerDay: () => 'Avg / day',
  currentStreak: () => 'Current streak',
  bestStreak: () => 'Best streak',
  lastActiveDate: () => 'Last active',
  lastSyncedAt: () => 'Last synced',
  lastError: () => 'Sync error',
  inactiveFlag: () => 'Inactive in window?',
};

/**
 * Builds a tailored CSV from already-aggregated student stats. Columns, window
 * label and scope are chosen by the user in the Export modal. Purely DB-driven —
 * no live GitHub scraping — so it runs instantly.
 */
export function exportCustomCsv(filePath: string, stats: StudentStats[], options: ExportOptions): number {
  const cols = options.columns.length ? options.columns : (Object.keys(COLUMN_LABELS) as ExportColumnKey[]);
  const header = cols.map((c) => csvEscape(COLUMN_LABELS[c](options.windowLabel)));
  const lines = [header.join(',')];

  for (const s of stats) {
    const row = cols.map((c) => {
      switch (c) {
        case 'name':
          return s.name;
        case 'regNo':
          return s.regNo;
        case 'email':
          return s.email;
        case 'dept':
          return s.dept;
        case 'username':
          return s.username;
        case 'link':
          return s.link;
        case 'windowTotal':
          return s.windowTotal;
        case 'yearTotal':
          return s.yearTotal;
        case 'lifetimeTotal':
          return s.lifetimeTotal;
        case 'activeDays':
          return s.activeDays;
        case 'avgPerDay':
          return s.avgPerDay;
        case 'currentStreak':
          return s.currentStreak;
        case 'bestStreak':
          return s.bestStreak;
        case 'lastActiveDate':
          return s.lastActiveDate ?? '';
        case 'lastSyncedAt':
          return s.lastSyncedAt ?? '';
        case 'lastError':
          return s.lastError ?? '';
        case 'inactiveFlag':
          return s.windowTotal === 0 ? 'YES' : 'NO';
      }
    });
    lines.push(row.map(csvEscape).join(','));
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return stats.length;
}
