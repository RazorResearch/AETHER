import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useChartTheme } from '@/hooks/useTelemetry';
import { axisTickStyle, tooltipStyle } from './chartStyle';
import { performanceSeries, performanceSeriesMeta } from '@/data/demo';

const colorMap = {
  accent: 'accent',
  glacier: 'glacier',
  ok: 'ok',
} as const;

/** Demo tokens/second trend across the three most recent models. */
export function PerformanceTrendChart({
  height = 232,
  days = 14,
}: {
  height?: number;
  /** Window size in days; the demo series holds a 14-day window. */
  days?: number;
}) {
  const theme = useChartTheme();
  const tooltip = tooltipStyle(theme);
  const data = days >= performanceSeries.length ? performanceSeries : performanceSeries.slice(-days);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis
            dataKey="day"
            tick={axisTickStyle(theme)}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={axisTickStyle(theme)}
            tickLine={false}
            axisLine={false}
            width={46}
            domain={[20, 64]}
            tickFormatter={(value: number) => String(value)}
          />
          <Tooltip
            {...tooltip}
            formatter={(value: number | string, name: string) => [`${value} tok/s`, name]}
          />
          {performanceSeriesMeta.map((series) => (
            <Area
              key={series.key}
              type="linear"
              dataKey={series.key}
              name={series.label}
              stroke={theme[colorMap[series.color]]}
              strokeWidth={1.2}
              fill={theme[colorMap[series.color]]}
              fillOpacity={0.05}
              dot={false}
              activeDot={{ r: 2.5, strokeWidth: 0, fill: theme[colorMap[series.color]] }}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PerformanceLegend() {
  const theme = useChartTheme();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {performanceSeriesMeta.map((series) => (
        <span key={series.key} className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-mute">
          <span className="h-[1.5px] w-3" style={{ background: theme[colorMap[series.color]] }} />
          {series.label}
        </span>
      ))}
    </div>
  );
}
