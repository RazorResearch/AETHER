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
        <AreaChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
          <defs>
            {performanceSeriesMeta.map((series) => {
              const color = theme[colorMap[series.color]];
              return (
                <linearGradient
                  key={series.key}
                  id={`perf-${series.key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid stroke={theme.grid} strokeDasharray="2 4" vertical={false} />
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
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={theme[colorMap[series.color]]}
              strokeWidth={1.6}
              fill={`url(#perf-${series.key})`}
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: theme[colorMap[series.color]] }}
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {performanceSeriesMeta.map((series) => (
        <span key={series.key} className="inline-flex items-center gap-1.5 text-[10.5px] text-ink-mute">
          <span
            className="h-[2px] w-4 rounded-full"
            style={{ background: theme[colorMap[series.color]] }}
          />
          {series.label}
        </span>
      ))}
    </div>
  );
}
