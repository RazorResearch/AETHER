import { cn } from '@/utils/cn';

type GaugeTone = 'accent' | 'glacier' | 'ok' | 'warn' | 'danger';

const stroke: Record<GaugeTone, string> = {
  accent: 'rgb(var(--c-accent))',
  glacier: 'rgb(var(--c-glacier))',
  ok: 'rgb(var(--c-ok))',
  warn: 'rgb(var(--c-warn))',
  danger: 'rgb(var(--c-danger))',
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
 * Flat radial readout. Square line caps, no gradient, no glow — it reads as a
 * sensor indicator rather than a dashboard ornament.
 */
export function Gauge({
  value,
  size = 96,
  thickness = 5,
  tone = 'accent',
  valueLabel,
  unit = '%',
  className,
  ariaLabel,
}: GaugeProps) {
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
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgb(var(--c-line) / 0.7)"
          strokeWidth={thickness}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={stroke[tone]}
          strokeWidth={thickness}
          strokeLinecap="butt"
          strokeDasharray={`${dash} ${circumference}`}
          className="transition-[stroke-dasharray] duration-500"
        />
        {[0, 25, 50, 75].map((tick) => {
          const angle = (tick / 100) * 2 * Math.PI;
          const inner = radius - thickness / 2 - 4;
          const outer = inner - 2.5;
          return (
            <line
              key={tick}
              x1={center + Math.cos(angle) * inner}
              y1={center + Math.sin(angle) * inner}
              x2={center + Math.cos(angle) * outer}
              y2={center + Math.sin(angle) * outer}
              stroke="rgb(var(--c-ink-mute) / 0.4)"
              strokeWidth={1}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="readout text-[20px] leading-none text-ink">
          {valueLabel ?? Math.round(clamped)}
          <span className="ml-0.5 text-[12px] text-ink-mute">{unit}</span>
        </span>
      </div>
    </div>
  );
}
