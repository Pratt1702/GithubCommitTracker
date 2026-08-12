import { addDays } from './dates';

/**
 * Longest and current consecutive-day streaks.
 *
 * `dates` must be sorted ascending, unique, and contain only contributing days.
 * The current streak is counted backwards from `endDate`, tolerating the case
 * where today has no commits yet but yesterday did — otherwise every student's
 * streak would read 0 for most of the working day.
 *
 * Pure logic, deliberately kept free of any database import so it is testable
 * outside Electron (better-sqlite3 is built against Electron's ABI).
 */
export function streaks(dates: string[], endDate: string): { best: number; current: number } {
  if (!dates.length) return { best: 0, current: 0 };

  let best = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    if (addDays(dates[i - 1], 1) === dates[i]) run++;
    else run = 1;
    if (run > best) best = run;
  }

  const last = dates[dates.length - 1];
  let current = 0;
  if (last === endDate || last === addDays(endDate, -1)) {
    current = 1;
    for (let i = dates.length - 1; i > 0; i--) {
      if (addDays(dates[i - 1], 1) === dates[i]) current++;
      else break;
    }
  }

  return { best, current };
}
