/**
 * Preload bridge — the only channel between the sandboxed renderer and main.
 * Uses contextBridge exclusively; raw ipcRenderer is never exposed.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type {
  Cohort,
  CohortInput,
  CohortSummary,
  DashboardSummary,
  DateRange,
  DeptOption,
  ExportOptions,
  Granularity,
  ImportResult,
  RefreshProgress,
  RefreshRun,
  Student,
  StudentInput,
  StudentStats,
  ThemeMode,
  TrendPoint,
} from '../shared/types';

export interface StatsFilterDTO {
  range: DateRange;
  cohortId?: number;
  depts?: string[];
  search?: string;
  includeInactive?: boolean;
}

export interface ColumnMapDTO {
  name: number;
  regNo: number;
  email: number;
  dept: number;
  link: number;
}

/** Every column the customizable export can emit. */
export type { ExportColumnKey, ExportOptions } from '../shared/types';

/** Options the Export modal sends to build a tailored CSV. */
export interface CsvPreviewDTO {
  headers: string[];
  rows: string[][];
  detected: ColumnMapDTO;
  totalRows: number;
}

const api = {
  /** Frameless-window controls used by the custom title bar. */
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    maximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (cb: (isMaximized: boolean) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, v: boolean) => cb(v);
      ipcRenderer.on('window:maximize-changed', handler);
      return () => ipcRenderer.off('window:maximize-changed', handler);
    },
  },

  theme: {
    get: (): Promise<ThemeMode> => ipcRenderer.invoke('theme:get'),
    set: (mode: ThemeMode): Promise<void> => ipcRenderer.invoke('theme:set', mode),
  },

  cohorts: {
    getAll: (): Promise<Cohort[]> => ipcRenderer.invoke('cohorts:getAll'),
    get: (id: number): Promise<Cohort | null> => ipcRenderer.invoke('cohorts:get', id),
    create: (input: CohortInput): Promise<number> => ipcRenderer.invoke('cohorts:create', input),
    update: (id: number, input: CohortInput): Promise<void> => ipcRenderer.invoke('cohorts:update', id, input),
    remove: (id: number): Promise<void> => ipcRenderer.invoke('cohorts:delete', id),
    summaries: (range: DateRange, granularity: Granularity): Promise<CohortSummary[]> =>
      ipcRenderer.invoke('cohorts:summaries', range, granularity),
  },

  students: {
    getByCohort: (cohortId: number): Promise<Student[]> => ipcRenderer.invoke('students:getByCohort', cohortId),
    add: (cohortId: number, input: StudentInput): Promise<{ id: number; created: boolean }> =>
      ipcRenderer.invoke('students:add', cohortId, input),
    update: (id: number, input: StudentInput): Promise<void> => ipcRenderer.invoke('students:update', id, input),
    setActive: (id: number, active: boolean): Promise<void> =>
      ipcRenderer.invoke('students:setActive', id, active),
    move: (id: number, cohortId: number): Promise<void> => ipcRenderer.invoke('students:move', id, cohortId),
    remove: (id: number): Promise<void> => ipcRenderer.invoke('students:delete', id),
    verify: (link: string): Promise<boolean> => ipcRenderer.invoke('students:verify', link),
    series: (id: number, range: DateRange): Promise<Array<{ date: string; count: number }>> =>
      ipcRenderer.invoke('students:series', id, range),
    departments: (cohortId?: number): Promise<DeptOption[]> =>
      ipcRenderer.invoke('students:departments', cohortId),
  },

  dashboard: {
    summary: (filter: StatsFilterDTO): Promise<DashboardSummary> => ipcRenderer.invoke('dashboard:summary', filter),
    stats: (filter: StatsFilterDTO): Promise<StudentStats[]> => ipcRenderer.invoke('dashboard:stats', filter),
    trend: (filter: StatsFilterDTO, granularity: Granularity): Promise<TrendPoint[]> =>
      ipcRenderer.invoke('dashboard:trend', filter, granularity),
    earliestDate: (cohortId?: number): Promise<string | null> =>
      ipcRenderer.invoke('dashboard:earliestDate', cohortId),
  },

  refresh: {
    all: (mode: 'incremental' | 'full'): Promise<RefreshProgress> => ipcRenderer.invoke('refresh:all', mode),
    cohort: (cohortId: number, mode: 'incremental' | 'full'): Promise<RefreshProgress> =>
      ipcRenderer.invoke('refresh:cohort', cohortId, mode),
    one: (id: number): Promise<RefreshProgress> => ipcRenderer.invoke('refresh:one', id),
    cancel: (): Promise<void> => ipcRenderer.invoke('refresh:cancel'),
    isRunning: (): Promise<boolean> => ipcRenderer.invoke('refresh:isRunning'),
    /** Fired per-student as each finishes syncing — patch the table row live. */
    onStudentUpdate: (cb: (studentId: number) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, id: number) => cb(id);
      ipcRenderer.on('refresh:student', handler);
      return () => ipcRenderer.off('refresh:student', handler);
    },
    history: (cohortId?: number): Promise<RefreshRun[]> => ipcRenderer.invoke('refresh:history', cohortId),
    onProgress: (cb: (p: RefreshProgress) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, p: RefreshProgress) => cb(p);
      ipcRenderer.on('refresh:progress', handler);
      return () => ipcRenderer.off('refresh:progress', handler);
    },
  },

  csv: {
    pick: (): Promise<{ filePath: string; preview: CsvPreviewDTO } | null> => ipcRenderer.invoke('csv:pick'),
    import: (
      cohortId: number,
      filePath: string,
      options?: { columns?: ColumnMapDTO; replaceAll?: boolean },
    ): Promise<ImportResult & { newIds: number[] }> =>
      ipcRenderer.invoke('csv:import', cohortId, filePath, options ?? {}),
    exportStats: (stats: StudentStats[], windowLabel: string, cohortName: string): Promise<string | null> =>
      ipcRenderer.invoke('csv:exportStats', stats, windowLabel, cohortName),
    exportCustom: (
      cohortId: number,
      options: ExportOptions,
    ): Promise<{ path: string; count: number } | null> =>
      ipcRenderer.invoke('csv:exportCustom', cohortId, options),
    exportDaily: (cohortId: number | undefined, range: DateRange): Promise<string | null> =>
      ipcRenderer.invoke('csv:exportDaily', cohortId, range),
  },

  system: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('system:openExternal', url),
    dbPath: (): Promise<string> => ipcRenderer.invoke('system:dbPath'),
    revealDb: (): Promise<void> => ipcRenderer.invoke('system:revealDb'),
    repoUrl: 'https://github.com/Pratt1702/GithubCommitTracker',
    appVersion: (): Promise<string> => ipcRenderer.invoke('system:appVersion'),
    checkUpdates: (): Promise<{ ok: boolean; updateAvailable?: boolean; version?: string | null; reason?: string }> =>
      ipcRenderer.invoke('system:checkUpdates'),
    downloadUpdate: (): Promise<boolean> => ipcRenderer.invoke('system:downloadUpdate'),
    quitAndInstall: (): Promise<void> => ipcRenderer.invoke('system:quitAndInstall'),
    /** Fired on Windows when a new release exists / has been downloaded. */
    onUpdate: (
      cb: (state: { available?: string; downloaded?: string }) => void,
    ): (() => void) => {
      const onAvail = (_: Electron.IpcRendererEvent, v: string) => cb({ available: v });
      const onDone = (_: Electron.IpcRendererEvent, v: string) => cb({ downloaded: v });
      ipcRenderer.on('system:update-available', onAvail);
      ipcRenderer.on('system:update-downloaded', onDone);
      return () => {
        ipcRenderer.off('system:update-available', onAvail);
        ipcRenderer.off('system:update-downloaded', onDone);
      };
    },
    /** Fired when an update check fails (e.g. no network, no releases). */
    onUpdateError: (cb: (message: string) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, message: string) => cb(message);
      ipcRenderer.on('system:update-error', handler);
      return () => ipcRenderer.off('system:update-error', handler);
    },
  },

  platform: process.platform as NodeJS.Platform,
};

contextBridge.exposeInMainWorld('tracker', api);

export type TrackerApi = typeof api;
