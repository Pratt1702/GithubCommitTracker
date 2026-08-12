import { ipcMain, dialog, shell, BrowserWindow, app, screen } from 'electron';
import log from 'electron-log';
import path from 'path';
import db from '../../database/sqlite';
import { CohortRepository } from '../../database/repositories/cohort.repository';
import { StudentRepository, extractUsername } from '../../database/repositories/student.repository';
import { ContributionRepository, type StatsFilter } from '../../database/repositories/contribution.repository';
import { RefreshRunRepository } from '../../database/repositories/refresh-run.repository';
import { buildSummary } from '../services/dashboard.service';
import {
  importCsv,
  previewCsv,
  exportStatsCsv,
  exportDailyCsv,
  type ImportOptions,
} from '../services/csv.service';
import { runRefresh, cancelRefresh, isRefreshRunning, backfillNewStudents } from '../services/refresh.service';
import { verifyUsername } from '../services/github-scraper.service';
import { getDbPath } from '../../database/sqlite';
import type {
  CohortInput,
  DateRange,
  Granularity,
  StudentInput,
  StudentStats,
  ThemeMode,
} from '../../shared/types';

const cohorts = new CohortRepository();
const students = new StudentRepository();
const contributions = new ContributionRepository();
const runs = new RefreshRunRepository();

/** Wraps a handler so failures are logged once and surfaced as a clean message. */
function handle<T extends unknown[], R>(channel: string, fn: (...args: T) => R | Promise<R>): void {
  ipcMain.handle(channel, async (_e, ...args: unknown[]) => {
    try {
      return await fn(...(args as T));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`IPC ${channel} failed: ${message}`);
      throw new Error(message);
    }
  });
}

function focusedWindow(event?: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  if (event) {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (w) return w;
  }
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

function getMeta(key: string): string | null {
  const r = db.prepare(`SELECT value FROM metadata WHERE key = ?`).get(key) as { value: string } | undefined;
  return r?.value ?? null;
}

function setMeta(key: string, value: string): void {
  db.prepare(
    `INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function registerIpc(): void {
  // ── Custom window controls (frameless window) ─────────────────────────────
  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
  });
  ipcMain.handle('window:maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });
  ipcMain.handle('window:isMaximized', (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false);

  // ── Theme (persisted so the choice survives restarts) ─────────────────────
  handle('theme:get', (): ThemeMode => (getMeta('theme') === 'light' ? 'light' : 'dark'));
  handle('theme:set', (mode: ThemeMode) => setMeta('theme', mode === 'light' ? 'light' : 'dark'));

  // ── Cohorts ──────────────────────────────────────────────────────────────
  handle('cohorts:getAll', () => cohorts.getAll());
  handle('cohorts:get', (id: number) => cohorts.getById(id));
  handle('cohorts:create', (input: CohortInput) => cohorts.create(input));
  handle('cohorts:update', (id: number, input: CohortInput) => cohorts.update(id, input));
  handle('cohorts:delete', (id: number) => cohorts.delete(id));
  handle('cohorts:summaries', (range: DateRange, g: Granularity) => contributions.cohortSummaries(range, g));

  // ── Students ─────────────────────────────────────────────────────────────
  handle('students:getByCohort', (cohortId: number) => students.getByCohort(cohortId));
  handle('students:add', (cohortId: number, input: StudentInput) => students.upsert(cohortId, input));
  handle('students:update', (id: number, input: StudentInput) => students.update(id, input));
  handle('students:setActive', (id: number, active: boolean) => students.setActive(id, active));
  handle('students:move', (id: number, cohortId: number) => students.moveToCohort(id, cohortId));
  handle('students:delete', (id: number) => students.delete(id));
  handle('students:verify', (link: string) => verifyUsername(extractUsername(link)));
  handle('students:series', (id: number, range: DateRange) => contributions.studentSeries(id, range));
  handle('students:departments', (cohortId?: number) => students.departments(cohortId));

  // ── Dashboard ────────────────────────────────────────────────────────────
  handle('dashboard:summary', (filter: StatsFilter) => buildSummary(filter));
  handle('dashboard:stats', (filter: StatsFilter) => contributions.stats(filter));
  handle('dashboard:trend', (filter: StatsFilter, g: Granularity) => contributions.trend(filter, g));
  handle('dashboard:earliestDate', (cohortId?: number) => contributions.earliestDate(cohortId));

  // ── Refresh ──────────────────────────────────────────────────────────────
  handle('refresh:all', (mode: 'incremental' | 'full') => runRefresh({ mode }));
  handle('refresh:cohort', (cohortId: number, mode: 'incremental' | 'full') =>
    runRefresh({ mode, cohortId }),
  );
  handle('refresh:one', (id: number) => runRefresh({ mode: 'full', studentIds: [id] }));
  handle('refresh:cancel', () => cancelRefresh());
  handle('refresh:isRunning', () => isRefreshRunning());
  handle('refresh:history', (cohortId?: number) => runs.recent(30, cohortId));

  // ── CSV ──────────────────────────────────────────────────────────────────
  handle('csv:pick', async () => {
    const win = focusedWindow();
    const res = await dialog.showOpenDialog(win!, {
      title: 'Select the student roster CSV',
      filters: [{ name: 'CSV files', extensions: ['csv', 'txt'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths.length) return null;
    return { filePath: res.filePaths[0], preview: previewCsv(res.filePaths[0]) };
  });

  handle('csv:import', async (cohortId: number, filePath: string, options: ImportOptions) => {
    const result = importCsv(cohortId, filePath, options);
    // Backfill history for newly added students without blocking the reply.
    if (result.newIds.length) {
      backfillNewStudents(result.newIds).catch((err) => log.error('Backfill after import failed:', err));
    }
    return result;
  });

  handle('csv:exportStats', async (stats: StudentStats[], windowLabel: string, cohortName: string) => {
    const win = focusedWindow();
    const safe = cohortName.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'all-cohorts';
    const res = await dialog.showSaveDialog(win!, {
      title: 'Export table',
      defaultPath: path.join(
        app.getPath('documents'),
        `${safe} — activity ${new Date().toISOString().slice(0, 10)}.csv`,
      ),
      filters: [{ name: 'CSV files', extensions: ['csv'] }],
    });
    if (res.canceled || !res.filePath) return null;
    exportStatsCsv(res.filePath, stats, windowLabel);
    return res.filePath;
  });

  handle('csv:exportDaily', async (cohortId: number | undefined, range: DateRange) => {
    const win = focusedWindow();
    const res = await dialog.showSaveDialog(win!, {
      title: 'Export daily contribution rows',
      defaultPath: path.join(app.getPath('documents'), `commit-daily-${range.from}_to_${range.to}.csv`),
      filters: [{ name: 'CSV files', extensions: ['csv'] }],
    });
    if (res.canceled || !res.filePath) return null;
    exportDailyCsv(res.filePath, cohortId, range.from, range.to);
    return res.filePath;
  });

  // ── System ───────────────────────────────────────────────────────────────
  handle('system:openExternal', (url: string) => {
    if (!/^https:\/\/(www\.)?github\.com\//i.test(url)) throw new Error('Only github.com links may be opened');
    return shell.openExternal(url);
  });
  handle('system:dbPath', () => getDbPath());
  handle('system:revealDb', () => shell.showItemInFolder(getDbPath()));
  handle('system:scaleFactor', () => screen.getPrimaryDisplay().scaleFactor);
}
