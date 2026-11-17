import { useId } from 'react';
import { cn } from '@/utils/cn';

type GaugeTone = 'accent' | 'glacier' | 'ok' | 'warn' | 'danger';

const stops: Record<GaugeTone, [string, string]> = {
  accent: ['#7dd3fc', '#22d3ee'],
  glacier: ['#a5e4ff', '#7dd3fc'],
  ok: ['#6ee7b7', '#2dd4a0'],
  warn: ['#fcd34d', '#f5be50'],
  danger: ['#fca5a5', '#f87171'],
};

interface GaugeProps {
  /** 0–100 */
  value: number;
  size?: number;
  thickness?: number;
  tone?: GaugeTone;
  /** Center readout, e.g. "15.4". */
  valueLabel?: string;
  unit?: string;
  className?: string;
  ariaLabel: string;
}

/**
 * Compact radial gauge with quarter tick marks.
 * Pure SVG so it renders identically in every theme.
 */
export function Gauge({
  value,
  size = 88,
  thickness = 6,
  tone = 'accent',
  valueLabel,
  unit = '%',
  className,
  ariaLabel,
}: GaugeProps) {
  const gradientId = useId();
  const clamped = Math.min(100, Math.max(0, value));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  const center = size / 2;

  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${ariaLabel}: ${Math.round(clamped)}${unit}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={stops[tone][0]} />
            <stop offset="100%" stopColor={stops[tone][1]} />
          </linearGradient>
        </defs>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgb(var(--c-line) / 0.55)"
          strokeWidth={thickness}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
        {[0, 25, 50, 75].map((tick) => {
          const angle = (tick / 100) * 2 * Math.PI;
          const inner = radius - thickness / 2 - 4;
          const outer = inner - 3;
          return (
            <line
              key={tick}
              x1={center + Math.cos(angle) * inner}
              y1={center + Math.sin(angle) * inner}
              x2={center + Math.cos(angle) * outer}
              y2={center + Math.sin(angle) * outer}
              stroke="rgb(var(--c-ink-mute) / 0.45)"
              strokeWidth={1}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="readout text-[17px] font-medium leading-none text-ink">
          {valueLabel ?? Math.round(clamped)}
          <span className="ml-0.5 text-[9px] text-ink-mute">{unit}</span>
        </span>
      </div>
    </div>
  );
}
