import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import { initDb } from '../database/sqlite';
import { registerIpc } from './ipc';

// GitHub releases are the only update source, and we ship Windows (.exe/NSIS)
// first. Nothing is auto-downloaded without the user's consent.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
if (process.platform === 'win32') {
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'Pratt1702',
    repo: 'GithubCommitTracker',
  });
  // Surface updater diagnostics to the same log file as the app.
  autoUpdater.logger = log;
  autoUpdater.on('error', (err) => {
    log.error('auto-update error', err);
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('system:update-error', err.message);
  });
}

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform', 'x11');
}

log.transports.file.level = 'info';
log.transports.console.level = 'debug';

const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 700,
    frame: false, // OS title bar and menu bar removed; renderer draws its own
    title: 'CommitTracker',
    // Matches --bg in the dark theme, preventing a white flash on startup.
    backgroundColor: '#0b0b0c',
    show: false,
    icon: path.join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  // Keep the renderer's maximize/restore icon in sync with reality.
  const emitMaximize = () => win.webContents.send('window:maximize-changed', win.isMaximized());
  win.on('maximize', emitMaximize);
  win.on('unmaximize', emitMaximize);

  // External links never open inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
  return win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    log.info('CommitTracker starting', { version: app.getVersion(), platform: process.platform });
    initDb();
    registerIpc();
    createWindow();

    // On Windows, ask GitHub releases for a newer version on launch (and once an
    // hour). We never auto-download; the user opts in from the title bar badge.
    if (process.platform === 'win32') {
      const check = () => {
        autoUpdater
          .checkForUpdates()
          .catch((err) => log.warn('update check skipped:', err.message));
      };
      autoUpdater.on('update-available', (info) => {
        log.info('update available', info.version);
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send('system:update-available', info.version);
      });
      autoUpdater.on('update-downloaded', (info) => {
        log.info('update downloaded, ready to install', info.version);
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send('system:update-downloaded', info.version);
      });
      setTimeout(check, 4000);
      setInterval(check, 60 * 60 * 1000);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
