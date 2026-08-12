import { useEffect, useState, type ReactNode } from 'react';
import { useDismiss } from '../hooks/useDashboard';

/** Formats large counts compactly (12.4k) while keeping small ones exact. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 100_000) return `${Math.round(n / 1000)}k`;
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

/** "3 days ago" style relative time for sync timestamps. */
export function ago(iso: string | null): string {
  if (!iso) return 'never';
  // SQLite datetime('now') returns UTC without a zone marker.
  const then = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`).getTime();
  if (Number.isNaN(then)) return iso;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? 'modal wide' : 'modal'} role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {subtitle && <div className="sub">{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}

/** Two-step confirmation for destructive actions (delete cohort/student). */
export function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="notice alert">{message}</div>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn danger"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/** The ⋮ overflow menu used for per-row and per-card destructive actions. */
export function KebabMenu({ children, label = 'More actions' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  return (
    <div className="pop-wrap" ref={ref}>
      <button
        className="btn ghost icon"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {open && (
        <div className="menu right" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function Toast({ message, kind, onDone }: { message: string; kind: 'ok' | 'alert'; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4200);
    return () => clearTimeout(t);
  }, [message, onDone]);

  return <div className={kind === 'alert' ? 'toast alert' : 'toast'}>{message}</div>;
}

/** Inline CSS sparkline — no chart library needed for the cohort cards. */
export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const last = values.length - 1;
  return (
    <div className="spark" aria-hidden>
      {values.map((v, i) => (
        <i key={i} className={i === last ? 'on' : undefined} style={{ height: `${Math.max(4, (v / max) * 100)}%` }} />
      ))}
    </div>
  );
}
