import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { benchmarkRadar } from '@/data/demo';
import { useChartTheme } from '@/hooks/useTelemetry';
import { axisTickStyle, tooltipStyle } from './chartStyle';

/** Normalized 0–100 comparison across the six benchmark dimensions. */
export function BenchmarkRadar({ height = 252 }: { height?: number }) {
  const theme = useChartTheme();
  const tooltip = tooltipStyle(theme);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={benchmarkRadar} outerRadius="72%">
          <PolarGrid stroke={theme.grid} />
          <PolarAngleAxis dataKey="axis" tick={{ ...axisTickStyle(theme), fontSize: 9.5 }} />
          <Tooltip {...tooltip} />
          <Radar
            name="Baseline"
            dataKey="original"
            stroke={theme.glacier}
            strokeWidth={1.3}
            fill={theme.glacier}
            fillOpacity={0.1}
            isAnimationActive={false}
          />
          <Radar
            name="Optimized"
            dataKey="optimized"
            stroke={theme.accent}
            strokeWidth={1.6}
            fill={theme.accent}
            fillOpacity={0.16}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
