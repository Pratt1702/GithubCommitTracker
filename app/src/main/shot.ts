/**
 * Screenshot harness: boots the real renderer bundle with the real IPC layer and
 * captures the window in both themes. Development verification only.
 *
 *   npm run shot
 */
import path from 'path';
import fs from 'fs';
import { app, BrowserWindow } from 'electron';
import { initDb } from '../database/sqlite';
import { registerIpc } from './ipc';

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform', 'x11');
}

const OUT = process.env.SHOT_DIR ?? '/tmp';

async function shoot(win: BrowserWindow, name: string) {
  const img = await win.capturePage();
  const file = path.join(OUT, `${name}.png`);
  fs.writeFileSync(file, img.toPNG());
  console.log(`wrote ${file} (${img.getSize().width}x${img.getSize().height})`);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  initDb();
  registerIpc();

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    frame: false,
    show: true,
    backgroundColor: '#0b0b0c',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  await win.loadFile(path.join(__dirname, '../../dist/index.html'));
  await wait(2500);
  await shoot(win, 'ct-1-cohorts-dark');

  // Light theme via the same toggle the title-bar button drives.
  await win.webContents.executeJavaScript(
    `(async()=>{document.documentElement.dataset.theme='light';await window.tracker.theme.set('light');})()`,
  );
  await wait(900);
  await shoot(win, 'ct-2-cohorts-light');

  // Back to dark, then open the first cohort by clicking its card.
  await win.webContents.executeJavaScript(
    `(async()=>{document.documentElement.dataset.theme='dark';await window.tracker.theme.set('dark');})()`,
  );
  await wait(600);
  await win.webContents.executeJavaScript(
    `document.querySelectorAll('.cohort-card')[1]?.click() ?? document.querySelector('.cohort-card')?.click()`,
  );
  await wait(2600);
  await shoot(win, 'ct-3-cohort-detail-dark');

  await win.webContents.executeJavaScript(
    `(async()=>{document.documentElement.dataset.theme='light';await window.tracker.theme.set('light');})()`,
  );
  await wait(1200);
  await shoot(win, 'ct-4-cohort-detail-light');

  // Monthly view + a student detail modal.
  await win.webContents.executeJavaScript(
    `(async()=>{document.documentElement.dataset.theme='dark';await window.tracker.theme.set('dark');
      [...document.querySelectorAll('.btn-group button')].find(b=>b.textContent.trim()==='This year')?.click();})()`,
  );
  await wait(2200);
  await shoot(win, 'ct-5-monthly-view');

  await win.webContents.executeJavaScript(`document.querySelector('tbody tr')?.click()`);
  await wait(2000);
  await shoot(win, 'ct-6-student-detail');

  // Reset the persisted theme so the harness leaves no trace.
  await win.webContents.executeJavaScript(`window.tracker.theme.set('dark')`);
  console.log('screenshots complete');
  app.exit(0);
});
