import type { useChartTheme } from '@/hooks/useTelemetry';

export type ChartTheme = ReturnType<typeof useChartTheme>;

/** Shared Recharts tooltip styling so every chart matches the shell. */
export function tooltipStyle(theme: ChartTheme) {
  return {
    contentStyle: {
      background: theme.tooltipBg,
      border: `1px solid ${theme.tooltipBorder}`,
      borderRadius: 6,
      padding: '7px 10px',
      boxShadow: '0 24px 48px -24px rgba(0,0,0,0.7)',
      fontSize: 11,
    },
    labelStyle: {
      color: theme.axis,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 9.5,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.1em',
      marginBottom: 3,
    },
    itemStyle: {
      color: theme.tooltipText,
      fontSize: 11,
      padding: '1px 0',
    },
    wrapperStyle: { outline: 'none' as const },
    cursor: { fill: 'rgb(148 163 184 / 0.06)' },
  };
}

export const axisTickStyle = (theme: ChartTheme) => ({
  fill: theme.axis,
  fontSize: 9.5,
  fontFamily: "'JetBrains Mono', monospace",
});
