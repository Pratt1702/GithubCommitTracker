/** Pure date helpers shared by main and renderer. No Node/DOM specifics. */

import type { DateRange, Granularity, RangePreset } from './types';

/** Formats a Date as YYYY-MM-DD in local time (avoids UTC off-by-one). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function daysBetween(from: string, to: string): number {
  const ms = parseISODate(to).getTime() - parseISODate(from).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** Earliest year the app scrapes. GitHub calendars before this are ignored. */
export const EARLIEST_YEAR = 2020;

/**
 * Resolves a preset into a concrete inclusive date range.
 * `today` is injectable so this stays deterministic in tests.
 */
export function resolveRange(preset: RangePreset, today = new Date(), custom?: DateRange): DateRange {
  const to = toISODate(today);
  switch (preset) {
    case '28d':
      return { from: addDays(to, -27), to };
    case '3m': {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 3);
      d.setDate(d.getDate() + 1);
      return { from: toISODate(d), to };
    }
    case '6m': {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 6);
      d.setDate(d.getDate() + 1);
      return { from: toISODate(d), to };
    }
    case 'ytd':
      return { from: `${today.getFullYear()}-01-01`, to };
    case 'all':
      return { from: `${EARLIEST_YEAR}-01-01`, to };
    case 'custom':
      return custom ?? { from: addDays(to, -27), to };
  }
}

/** The window of equal length immediately preceding `range`, for delta comparison. */
export function previousRange(range: DateRange): DateRange {
  const len = daysBetween(range.from, range.to);
  return { from: addDays(range.from, -len), to: addDays(range.from, -1) };
}

/** ISO-8601 week key, e.g. 2026-W07. Weeks start Monday. */
export function weekKey(iso: string): string {
  const d = parseISODate(iso);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNum = (target.getDay() + 6) % 7; // Mon=0
  target.setDate(target.getDate() - dayNum + 3); // Thursday of this week
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function bucketKey(iso: string, g: Granularity): string {
  switch (g) {
    case 'day':
      return iso;
    case 'week':
      return weekKey(iso);
    case 'month':
      return iso.slice(0, 7);
    case 'year':
      return iso.slice(0, 4);
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function bucketLabel(bucket: string, g: Granularity): string {
  switch (g) {
    case 'day': {
      const [, m, d] = bucket.split('-');
      return `${d} ${MONTHS[Number(m) - 1]}`;
    }
    case 'week': {
      const [y, w] = bucket.split('-W');
      return `W${w} '${y.slice(2)}`;
    }
    case 'month': {
      const [y, m] = bucket.split('-');
      return `${MONTHS[Number(m) - 1]} ${y}`;
    }
    case 'year':
      return bucket;
  }
}

/** All bucket keys covering the range, in chronological order (gaps filled). */
export function enumerateBuckets(range: DateRange, g: Granularity): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let cur = range.from;
  let guard = 0;
  while (cur <= range.to && guard++ < 20_000) {
    const key = bucketKey(cur, g);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
    cur = addDays(cur, 1);
  }
  return out;
}
