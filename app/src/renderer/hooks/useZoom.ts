import { useEffect } from 'react';

const KEY = 'committracker.zoom';
const MIN = 0.7;
const MAX = 1.8;
const STEP = 0.1;

function read(): number {
  try {
    const raw = Number(localStorage.getItem(KEY));
    return Number.isFinite(raw) && raw >= MIN && raw <= MAX ? raw : 1;
  } catch {
    return 1;
  }
}

function write(factor: number): void {
  try {
    localStorage.setItem(KEY, String(factor));
  } catch {
    /* storage unavailable (e.g. disabled) — keep the in-session zoom only */
  }
}

function apply(factor: number): void {
  document.documentElement.style.zoom = String(factor);
}

/**
 * Ctrl/Cmd + '+' zooms in, '-' zooms out, '0' resets to 100%.
 * The level is persisted and applied to the root element (Chromium `zoom`).
 */
export function useZoom(): void {
  useEffect(() => {
    apply(read());

    const clamp = (n: number) => Math.min(MAX, Math.max(MIN, Math.round(n * 100) / 100));

    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key;
      if (k !== '+' && k !== '=' && k !== '-' && k !== '_' && k !== '0') return;
      e.preventDefault();
      const cur = read();
      let next = cur;
      if (k === '0') next = 1;
      else if (k === '+' || k === '=') next = cur + STEP;
      else if (k === '-' || k === '_') next = cur - STEP;
      next = clamp(next);
      write(next);
      apply(next);
      window.dispatchEvent(new CustomEvent('zoom-changed', { detail: next }));
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
