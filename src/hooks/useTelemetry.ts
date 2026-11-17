import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TelemetrySnapshot } from '@/types';
import { createTelemetrySnapshot } from '@/data/demo';
import { useAppStore } from '@/store/useAppStore';

/**
 * Simulated telemetry source.
 *
 * IMPORTANT: the browser sandbox cannot read GPU/VRAM counters. Every value
 * returned here is generated locally and must be presented as simulated.
 * The future Tauri shell (or a local Python bridge) will replace the generator
 * with `readSystemTelemetry()` from utils/systemBridge.ts.
 */
export function useTelemetry(options?: { intervalMs?: number; live?: boolean }) {
  const intervalMs = options?.intervalMs ?? 4000;
  const live = options?.live ?? true;

  const [snapshot, setSnapshot] = useState<TelemetrySnapshot>(() => createTelemetrySnapshot());
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(() => {
    setIsLoading(true);
    window.setTimeout(() => {
      setSnapshot(createTelemetrySnapshot());
      setIsLoading(false);
    }, 520);
  }, []);

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setSnapshot(createTelemetrySnapshot()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, live]);

  return { snapshot, isLoading, refresh };
}

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

/** Delay used to demonstrate skeleton states without faking data. */
export function useMountedLoading(delayMs = 420) {
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setIsLoading(false), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);
  return isLoading;
}
