/** Shared domain types used by main, preload and renderer. */

export interface Cohort {
  id: number;
  /** Display name, e.g. "2026 Batch — CSE B". Unique. */
  name: string;
  /** Admission/graduating batch, e.g. "2026". */
  batch: string;
  dept: string;
  section: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CohortInput {
  name: string;
  batch: string;
  dept: string;
  section: string;
  notes: string;
}

/** A cohort plus the roll-up numbers shown on its card on the home screen. */
export interface CohortSummary extends Cohort {
  studentCount: number;
  activeStudentCount: number;
  /** Contributions inside the selected window. */
  windowTotal: number;
  /** Contributions in the current calendar year. */
  yearTotal: number;
  lifetimeTotal: number;
  /** Mean contributions per student inside the window. */
  avgPerStudent: number;
  /** Students with zero contributions inside the window. */
  inactiveInWindow: number;
  /** Students whose last sync attempt failed. */
  erroredCount: number;
  lastSyncedAt: string | null;
  /** Per-bucket totals for the card's inline sparkline. */
  spark: number[];
}

export interface Student {
  id: number;
  cohortId: number;
  name: string;
  /** Optional college register/roll number. */
  regNo: string;
  /** Optional contact email (not used for scraping; stored from rosters). */
  email: string;
  dept: string;
  link: string;
  username: string;
  /** 0 = archived (excluded from refresh and aggregates), 1 = active. */
  active: number;
  createdAt: string;
  updatedAt: string;
}

export interface StudentInput {
  name: string;
  regNo: string;
  email: string;
  dept: string;
  link: string;
}

/** One student's aggregated stats over a resolved date window. */
export interface StudentStats {
  id: number;
  cohortId: number;
  name: string;
  regNo: string;
  email: string;
  dept: string;
  link: string;
  username: string;
  active: number;
  windowTotal: number;
  yearTotal: number;
  lifetimeTotal: number;
  /** Distinct days with >= 1 contribution inside the window. */
  activeDays: number;
  /** Longest run of consecutive contributing days inside the window. */
  bestStreak: number;
  /** Current streak counted backwards from the window end. */
  currentStreak: number;
  avgPerDay: number;
  lastActiveDate: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface DateRange {
  /** Inclusive start date, YYYY-MM-DD. */
  from: string;
  /** Inclusive end date, YYYY-MM-DD. */
  to: string;
}

export type RangePreset = '28d' | '3m' | '6m' | 'ytd' | 'all' | 'custom';

export type Granularity = 'day' | 'week' | 'month' | 'year';

export interface TrendPoint {
  /** Bucket key: YYYY-MM-DD (day), YYYY-Www (week), YYYY-MM (month), YYYY (year). */
  bucket: string;
  label: string;
  total: number;
  /** Number of distinct students contributing in this bucket. */
  activeStudents: number;
}

export interface DashboardSummary {
  studentCount: number;
  activeStudentCount: number;
  windowTotal: number;
  yearTotal: number;
  lifetimeTotal: number;
  inactiveInWindow: number;
  avgPerStudent: number;
  medianPerStudent: number;
  /** Percentage change of window total vs the immediately preceding window. */
  deltaPct: number | null;
  lastRefreshAt: string | null;
}

export interface RefreshProgress {
  runId: number;
  /** Cohort being refreshed, or null for an all-cohorts refresh. */
  cohortId: number | null;
  done: number;
  total: number;
  currentName: string;
  ok: number;
  failed: number;
  finished: boolean;
}

export interface RefreshRun {
  id: number;
  cohortId: number | null;
  cohortName: string | null;
  startedAt: string;
  finishedAt: string | null;
  studentsTotal: number;
  studentsOk: number;
  studentsFailed: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
}

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  totalRows: number;
}

export interface DeptOption {
  dept: string;
  count: number;
}

/** Every column the customizable cohort export can emit. */
export type ExportColumnKey =
  | 'name'
  | 'regNo'
  | 'email'
  | 'dept'
  | 'username'
  | 'link'
  | 'windowTotal'
  | 'yearTotal'
  | 'lifetimeTotal'
  | 'activeDays'
  | 'avgPerDay'
  | 'currentStreak'
  | 'bestStreak'
  | 'lastActiveDate'
  | 'lastSyncedAt'
  | 'lastError'
  | 'inactiveFlag';

/** Options the Export modal sends to build a tailored CSV. */
export interface ExportOptions {
  /** Resolved date window driving windowTotal. */
  range: DateRange;
  /** Shown in the "Contributions (…)" header. */
  windowLabel: string;
  /** Include active only / inactive (archived) only / both. */
  scope: 'active' | 'inactive' | 'both';
  depts: string[];
  search: string;
  /** Which columns to write, in order. */
  columns: ExportColumnKey[];
}

export type ThemeMode = 'dark' | 'light';
