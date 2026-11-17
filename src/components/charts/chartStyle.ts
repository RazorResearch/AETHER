import type { useChartTheme } from '@/hooks/useTelemetry';

export type ChartTheme = ReturnType<typeof useChartTheme>;

/** Shared Recharts tooltip styling so every chart matches the shell. */
export function tooltipStyle(theme: ChartTheme) {
  return {
    contentStyle: {
      background: theme.tooltipBg,
      border: `1px solid ${theme.tooltipBorder}`,
      borderRadius: 3,
      padding: '6px 8px',
      boxShadow: '0 10px 24px -16px rgba(0,0,0,0.6)',
      fontSize: 12,
    },
    labelStyle: {
      color: theme.axis,
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 10.5,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.06em',
      marginBottom: 2,
    },
    itemStyle: {
      color: theme.tooltipText,
      fontSize: 12,
      padding: '1px 0',
    },
    wrapperStyle: { outline: 'none' as const },
    cursor: { fill: 'rgb(148 163 184 / 0.05)' },
  };
}

export const axisTickStyle = (theme: ChartTheme) => ({
  fill: theme.axis,
  fontSize: 10.5,
  fontFamily: "'IBM Plex Mono', monospace",
});
