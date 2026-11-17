import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';

/** Ticking clock used by the workspace top bar. */
export function useClock(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}

/**
 * Chart palette resolved from the active theme. Recharts needs concrete
 * colour strings, so tokens are read from the computed CSS custom properties.
 */
export function useChartTheme() {
  const theme = useAppStore((state) => state.settings.theme);

  return useMemo(() => {
    const dark = theme === 'dark';
    return {
      accent: dark ? '#22d3ee' : '#0891b2',
      glacier: dark ? '#7dd3fc' : '#0284c7',
      ok: dark ? '#2dd4a0' : '#059669',
      warn: dark ? '#f5be50' : '#b06208',
      danger: dark ? '#f87171' : '#dc2626',
      grid: dark ? 'rgba(148,163,184,0.13)' : 'rgba(100,116,139,0.18)',
      axis: dark ? 'rgba(148,163,184,0.55)' : 'rgba(71,85,105,0.65)',
      tooltipBg: dark ? '#0d1220' : '#ffffff',
      tooltipBorder: dark ? 'rgba(148,163,184,0.22)' : 'rgba(100,116,139,0.25)',
      tooltipText: dark ? '#eaf0f8' : '#0d1623',
      series: [
        dark ? '#22d3ee' : '#0891b2',
        dark ? '#7dd3fc' : '#0284c7',
        dark ? '#2dd4a0' : '#059669',
        dark ? '#f5be50' : '#b06208',
      ],
    };
  }, [theme]);
}
