import { useEffect, useState } from 'react';

export interface ChartInk {
  primary: string;
  secondary: string;
  grid: string;
  axis: string;
  panel: string;
  line: string;
  fg: string;
}

function read(): ChartInk {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    primary: v('--chart-1', '#e9eaec'),
    secondary: v('--chart-2', '#6a6c72'),
    grid: v('--chart-grid', '#26272b'),
    axis: v('--chart-axis', '#6a6c72'),
    panel: v('--panel', '#121214'),
    line: v('--line-bright', '#3a3c42'),
    fg: v('--fg', '#e9eaec'),
  };
}

/**
 * Recharts needs concrete colour values rather than CSS variables, so chart ink
 * is read from the design-system tokens — keeping index.css the single source of
 * truth. A MutationObserver on the theme attribute means the ink stays correct
 * no matter what flips the theme, not just a React state change.
 */
export function useChartInk(): ChartInk {
  const [ink, setInk] = useState<ChartInk>(read);

  useEffect(() => {
    const observer = new MutationObserver(() => setInk(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    // Re-read once on mount in case fonts/vars resolved after first paint.
    setInk(read());
    return () => observer.disconnect();
  }, []);

  return ink;
}

/** Shared Recharts tooltip styling built from the current ink. */
export function tooltipStyles(ink: ChartInk) {
  return {
    contentStyle: {
      background: ink.panel,
      border: `1px solid ${ink.line}`,
      borderRadius: 5,
      fontSize: 11,
      fontFamily: 'JetBrains Mono, monospace',
      color: ink.fg,
    },
    labelStyle: { color: ink.fg, marginBottom: 2 },
    itemStyle: { color: ink.fg },
  };
}

export const AXIS_TICK = { fontSize: 10, fontFamily: 'JetBrains Mono, monospace' };
