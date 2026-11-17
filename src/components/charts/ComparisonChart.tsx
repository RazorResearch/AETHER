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
import { useT } from '@/i18n';

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
  const t = useT();
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
          margin={{ top: 4, right: 24, bottom: 0, left: 0 }}
          barGap={1}
        >
          <CartesianGrid stroke={theme.grid} vertical />
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
            width={140}
            tick={{ ...axisTickStyle(theme), fontSize: 10.5 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            {...tooltip}
            cursor={{ fill: 'rgb(148 163 184 / 0.05)' }}
            formatter={(value: number | string, name: string, item) => {
              if (name === t('Run B')) {
                const delta = (item?.payload as { delta?: number } | undefined)?.delta ?? 0;
                return [`${value} ${t('index')} (${signedPercent(delta)})`, name];
              }
              return [`${value} ${t('index')}`, name];
            }}
          />
          <ReferenceLine x={100} stroke={theme.axis} strokeDasharray="2 3" />
          <Bar
            dataKey="baseline"
            name={t('Run A (baseline)')}
            fill={theme.axis}
            fillOpacity={0.35}
            barSize={6}
            isAnimationActive={false}
          />
          <Bar
            dataKey="optimized"
            name={t('Run B')}
            fill={theme.accent}
            barSize={6}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
