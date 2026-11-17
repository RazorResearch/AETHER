import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BenchmarkMetric } from '@/types';
import { useChartTheme } from '@/hooks/useTelemetry';
import { comparisonIndex, signedPercent } from '@/utils/benchmark';
import { axisTickStyle, tooltipStyle } from './chartStyle';

interface ComparisonChartProps {
  metrics: BenchmarkMetric[];
  height?: number;
}

/**
 * Direction-aware comparison. Every bar is expressed against the baseline
 * (100 = identical), so a longer optimized bar always means an improvement.
 */
export function ComparisonChart({ metrics, height = 268 }: ComparisonChartProps) {
  const theme = useChartTheme();
  const tooltip = tooltipStyle(theme);

  const data = metrics.map((metric) => {
    const index = comparisonIndex(metric);
    return {
      label: metric.label,
      unit: metric.unit,
      baseline: 100,
      optimized: index.optimized,
      delta: index.deltaPct,
    };
  });

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 26, bottom: 0, left: 0 }}
          barGap={2}
        >
          <CartesianGrid stroke={theme.grid} strokeDasharray="2 4" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 140]}
            ticks={[0, 50, 100, 140]}
            tick={axisTickStyle(theme)}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => `${value}`}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={132}
            tick={{ ...axisTickStyle(theme), fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            {...tooltip}
            cursor={{ fill: 'rgb(148 163 184 / 0.06)' }}
            formatter={(value: number | string, name: string, item) => {
              if (name === 'Optimized') {
                const delta = (item?.payload as { delta?: number } | undefined)?.delta ?? 0;
                return [`${value} index (${signedPercent(delta)})`, name];
              }
              return [`${value} index`, name];
            }}
          />
          <ReferenceLine x={100} stroke={theme.axis} strokeDasharray="3 3" />
          <Bar
            dataKey="baseline"
            name="Baseline"
            fill={theme.axis}
            fillOpacity={0.55}
            radius={[0, 2, 2, 0]}
            barSize={7}
            isAnimationActive={false}
          />
          <Bar
            dataKey="optimized"
            name="Optimized"
            fill={theme.accent}
            radius={[0, 2, 2, 0]}
            barSize={7}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
