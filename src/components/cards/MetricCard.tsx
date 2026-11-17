import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { InfoHint } from '@/components/ui/Tooltip';
import { Gauge } from '@/components/charts/Gauge';
import { Sparkline } from '@/components/charts/Sparkline';
import { cn } from '@/utils/cn';

interface MetricCardProps {
  label: string;
  value: string;
  unit: string;
  secondary: string;
  percent: number;
  trend: number[];
  /** Scientific explanation surfaced in the tooltip. */
  detail: ReactNode;
  tone?: 'accent' | 'glacier' | 'ok' | 'warn' | 'danger';
  footer?: string;
  className?: string;
}

/** Compact telemetry tile: readout, radial gauge and short trend line. */
export function MetricCard({
  label,
  value,
  unit,
  secondary,
  percent,
  trend,
  detail,
  tone = 'accent',
  footer,
  className,
}: MetricCardProps) {
  return (
    <Card className={cn('group p-4 transition-colors hover:border-line', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="mono-label flex items-center gap-1.5 text-ink-mute">
          {label}
          <InfoHint content={detail} showIcon />
        </span>
        <span className="h-1 w-1 rounded-[1px] bg-accent/50 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="readout text-[23px] font-medium leading-none tracking-[-0.02em] text-ink">
            {value}
            <span className="ml-1 text-[10.5px] font-normal tracking-normal text-ink-mute">
              {unit}
            </span>
          </div>
          <div className="mt-1.5 truncate text-[10.5px] text-ink-mute">{secondary}</div>
        </div>
        <Gauge
          value={percent}
          size={54}
          thickness={4.5}
          tone={tone}
          ariaLabel={label}
          valueLabel={String(Math.round(percent))}
          unit="%"
          className="translate-y-0.5"
        />
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <Sparkline values={trend} width={104} height={22} tone={tone} />
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute/70">
          {footer ?? 'simulated'}
        </span>
      </div>
    </Card>
  );
}
