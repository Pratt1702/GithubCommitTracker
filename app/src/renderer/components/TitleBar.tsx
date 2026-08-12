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

  useEffect(() => {
    window.tracker.window.isMaximized().then(setMaximized);
    return window.tracker.window.onMaximizeChange(setMaximized);
  }, []);

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
