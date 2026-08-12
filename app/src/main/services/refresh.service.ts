import log from 'electron-log';
import { BrowserWindow } from 'electron';
import { StudentRepository } from '../../database/repositories/student.repository';
import { ContributionRepository } from '../../database/repositories/contribution.repository';
import { RefreshRunRepository } from '../../database/repositories/refresh-run.repository';
import { scrapeYear, UserNotFoundError } from './github-scraper.service';
import { EARLIEST_YEAR } from '../../shared/dates';
import type { RefreshProgress } from '../../shared/types';

const students = new StudentRepository();
const contributions = new ContributionRepository();
const runs = new RefreshRunRepository();

/** Politeness delay between HTTP requests so GitHub doesn't throttle a whole class. */
const REQUEST_DELAY_MS = 350;

let running = false;
let cancelRequested = false;

function emit(progress: RefreshProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('refresh:progress', progress);
  }
}

/** Tells the renderer a specific student just finished syncing, so it can
 *  patch that row's numbers into the table live instead of waiting for the rest. */
function emitStudentDone(studentId: number): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('refresh:student', studentId);
  }
}

export function isRefreshRunning(): boolean {
  return running;
}

export function cancelRefresh(): void {
  if (running) cancelRequested = true;
}

export interface RefreshOptions {
  /**
   * 'incremental' re-scrapes only the current year (fast, right for a daily refresh).
   * 'full' re-scrapes every year from EARLIEST_YEAR, rebuilding all history.
   */
  mode?: 'incremental' | 'full';
  /** Scope the refresh to one cohort. Omit to refresh every cohort. */
  cohortId?: number;
  /** Limit the refresh to specific student ids (takes precedence over cohortId). */
  studentIds?: number[];
}

/**
 * Refreshes contribution history.
 *
 * Safe to run repeatedly on the same day: each year's data is replaced with the
 * absolute values GitHub currently reports, so there is no diff arithmetic to
 * corrupt — the bug in the original Python script, where a second same-day run
 * subtracted the already-updated total from itself.
 */
export async function runRefresh(options: RefreshOptions = {}): Promise<RefreshProgress> {
  if (running) throw new Error('A refresh is already in progress');

  const mode = options.mode ?? 'incremental';
  const cohortId = options.cohortId ?? null;
  const cohort = options.studentIds?.length
    ? options.studentIds.map((id) => students.getById(id)).filter((s): s is NonNullable<typeof s> => !!s)
    : students.getActive(options.cohortId);

  running = true;
  cancelRequested = false;

  const runId = runs.start(cohort.length, cohortId);
  const currentYear = new Date().getFullYear();
  const years =
    mode === 'full'
      ? Array.from({ length: currentYear - EARLIEST_YEAR + 1 }, (_, i) => EARLIEST_YEAR + i)
      : [currentYear];

  let ok = 0;
  let failed = 0;
  let done = 0;

  const progressOf = (currentName: string, finished = false): RefreshProgress => ({
    runId,
    cohortId,
    done,
    total: cohort.length,
    currentName,
    ok,
    failed,
    finished,
  });

  try {
    for (const student of cohort) {
      if (cancelRequested) break;
      emit(progressOf(student.name));

      try {
        for (const year of years) {
          if (cancelRequested) break;
          const scrape = await scrapeYear(student.username, year);
          contributions.replaceYear(student.id, year, scrape.days);
          await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
        }
        contributions.markSynced(student.id, null);
        ok++;
      } catch (err) {
        const message =
          err instanceof UserNotFoundError
            ? `GitHub profile not found (${student.username})`
            : err instanceof Error
              ? err.message
              : String(err);
        log.error(`Refresh failed for ${student.name} (${student.username}): ${message}`);
        contributions.markSynced(student.id, message);
        failed++;
      }

      done++;
      emit(progressOf(student.name));
      emitStudentDone(student.id);
    }

    runs.finish(runId, ok, failed, cancelRequested ? 'cancelled' : 'completed');
    const final = progressOf('', true);
    emit(final);
    return final;
  } catch (err) {
    runs.finish(runId, ok, failed, 'failed');
    emit(progressOf('', true));
    throw err;
  } finally {
    running = false;
    cancelRequested = false;
  }
}

/**
 * Backfills full history for students that have never been scraped.
 * Called after a CSV import so a brand-new roster gets its trend lines without
 * the faculty having to pick "full rebuild" manually.
 */
export async function backfillNewStudents(ids: number[]): Promise<RefreshProgress | null> {
  if (!ids.length) return null;
  return runRefresh({ mode: 'full', studentIds: ids });
}
