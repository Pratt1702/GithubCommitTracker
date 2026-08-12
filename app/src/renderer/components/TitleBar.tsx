import { useEffect, useState } from 'react';
import type { ThemeMode } from '../../shared/types';

interface Crumb {
  label: string;
  onClick?: () => void;
}

interface Props {
  crumbs: Crumb[];
  theme: ThemeMode;
  onToggleTheme: () => void;
}

/**
 * Custom window chrome for the frameless window.
 * The bar itself is a drag region; every control opts out via .no-drag.
 */
export default function TitleBar({ crumbs, theme, onToggleTheme }: Props) {
  const [maximized, setMaximized] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [zoom, setZoom] = useState<number>(() => {
    try {
      const raw = Number(localStorage.getItem('committracker.zoom'));
      return Number.isFinite(raw) && raw >= 0.7 && raw <= 1.8 ? raw : 1;
    } catch {
      return 1;
    }
  });

  useEffect(() => {
    window.tracker.window.isMaximized().then(setMaximized);
    return window.tracker.window.onMaximizeChange(setMaximized);
  }, []);

  useEffect(() => {
    window.tracker.system.appVersion().then(setAppVersion);
    const onZoom = (e: Event) => setZoom((e as CustomEvent<number>).detail);
    window.addEventListener('zoom-changed', onZoom);
    // Live update status pushed from the Windows auto-updater.
    const offUpdate = window.tracker.system.onUpdate((state) => {
      if (state.available) setUpdateAvailable(state.available);
      if (state.downloaded) {
        setDownloaded(state.downloaded);
        setUpdateAvailable(null);
      }
    });
    return () => {
      window.removeEventListener('zoom-changed', onZoom);
      offUpdate();
    };
  }, []);

  const openRepo = () => window.tracker.system.openExternal(window.tracker.system.repoUrl);

  const setZoomLevel = (factor: number) => {
    const next = Math.min(1.8, Math.max(0.7, Math.round(factor * 100) / 100));
    try {
      localStorage.setItem('committracker.zoom', String(next));
    } catch {
      /* ignore — in-session zoom only */
    }
    document.documentElement.style.zoom = String(next);
    setZoom(next);
  };

  const upgrade = async () => {
    try {
      if (downloaded) {
        setInstalling(true);
        await window.tracker.system.quitAndInstall();
        return;
      }
      await window.tracker.system.downloadUpdate();
    } catch (err) {
      console.error('update action failed', err);
    }
  };

  return (
    <div className="titlebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
        CommitTracker
        {appVersion && <span className="brand-ver">v{appVersion}</span>}
      </div>

      <span className="dimmer">/</span>

      <nav className="crumbs">
        {crumbs.map((c, i) => (
          <span key={`${c.label}-${i}`} className="row tight">
            {i > 0 && <span className="sep">›</span>}
            {c.onClick ? (
              <button className="no-drag" onClick={c.onClick}>
                {c.label}
              </button>
            ) : (
              <span className="current truncate">{c.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="win-controls">
        {/* Zoom: Ctrl/Cmd + / - / 0 also works. */}
        <div className="zoom-ctl" role="group" aria-label="Zoom">
          <button className="win-btn slim" onClick={() => setZoomLevel(zoom - 0.1)} title="Zoom out (Ctrl/Cmd -)" aria-label="Zoom out">
            <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.5" y="5.5" width="9" height="1" fill="currentColor" /></svg>
          </button>
          <button className="zoom-val" onClick={() => setZoomLevel(1)} title="Reset zoom (Ctrl/Cmd 0)" aria-label="Reset zoom">
            {Math.round(zoom * 100)}%
          </button>
          <button className="win-btn slim" onClick={() => setZoomLevel(zoom + 0.1)} title="Zoom in (Ctrl/Cmd +)" aria-label="Zoom in">
            <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.5" y="5.5" width="9" height="1" fill="currentColor" /><rect x="5.5" y="1.5" width="1" height="9" fill="currentColor" /></svg>
          </button>
        </div>

        {/* GitHub repo — opens in the default browser. */}
        <button className="win-btn" onClick={openRepo} title="View source on GitHub" aria-label="Open GitHub repository">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </button>

        {/* Update badge — only meaningful on Windows builds. */}
        {(updateAvailable || downloaded) && (
          <button
            className={`win-btn update${downloaded ? ' ready' : ''}`}
            onClick={upgrade}
            disabled={installing}
            title={downloaded ? 'Restart to install update' : 'Download update'}
          >
            {downloaded ? `Update ${downloaded} · install` : `Update ${updateAvailable}`}
          </button>
        )}

        <button
          className="win-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle colour theme"
        >
          {theme === 'dark' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
          )}
        </button>

        <button className="win-btn" onClick={() => window.tracker.window.minimize()} aria-label="Minimise">
          <svg width="11" height="11" viewBox="0 0 12 12">
            <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>

        <button
          className="win-btn"
          onClick={() => window.tracker.window.maximize()}
          aria-label={maximized ? 'Restore' : 'Maximise'}
        >
          {maximized ? (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor">
              <rect x="1.5" y="3.5" width="7" height="7" />
              <path d="M3.5 3.5v-2h7v7h-2" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor">
              <rect x="1.5" y="1.5" width="9" height="9" />
            </svg>
          )}
        </button>

        <button className="win-btn close" onClick={() => window.tracker.window.close()} aria-label="Close">
          <svg width="11" height="11" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.2">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
