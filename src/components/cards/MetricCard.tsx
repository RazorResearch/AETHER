import type { ReactNode } from 'react';
import { InfoHint } from '@/components/ui/Tooltip';
import { Sparkline } from '@/components/charts/Sparkline';
import { cn } from '@/utils/cn';

type MetricTone = 'accent' | 'glacier' | 'ok' | 'warn' | 'danger';

const meterTone: Record<MetricTone, string> = {
  accent: 'bg-accent',
  glacier: 'bg-glacier',
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
};

interface MetricCardProps {
  label: string;
  value: string;
  unit: string;
  secondary: string;
  /** 0–100 fill of the horizontal meter. */
  percent: number;
  trend: number[];
  /** Scientific explanation surfaced in the tooltip. */
  detail: ReactNode;
  tone?: MetricTone;
  className?: string;
}

/**
 * Flat telemetry readout: label, value, thin capacity meter, micro trend.
 * Designed to sit inside a shared panel rather than as its own floating card.
 */
export function MetricCard({
  label,
  value,
  unit,
  secondary,
  percent,
  trend,
  detail,
  tone = 'accent',
  className,
}: MetricCardProps) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div className={cn('bg-surface px-4 py-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="mono-label">{label}</span>
        <InfoHint content={detail} showIcon />
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="readout text-[30px] font-medium leading-none text-ink">{value}</span>
        <span className="text-[13px] text-ink-mute">{unit}</span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="relative h-[3px] flex-1 bg-surface2">
          <div
            className={cn('absolute inset-y-0 left-0 transition-[width] duration-500', meterTone[tone])}
            style={{ width: `${clamped}%` }}
          />
        </div>
        <span className="readout w-[26px] text-right text-[12px] text-ink-mute">
          {Math.round(clamped)}%
        </span>
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-3">
        <span className="text-[13px] leading-tight text-ink-mute">{secondary}</span>
        <Sparkline values={trend} width={84} height={18} tone={tone} />
      </div>
    </div>
  );
}
