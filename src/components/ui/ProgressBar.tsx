import { cn } from '@/utils/cn';

interface ProgressBarProps {
  /** 0–100 */
  value: number;
  tone?: 'accent' | 'ok' | 'warn' | 'danger' | 'glacier';
  className?: string;
  height?: 'xs' | 'sm';
  /** Adds a subtle threshold marker at the given percentage. */
  markerAt?: number;
  label?: string;
}

const toneClasses = {
  accent: 'from-accent/70 to-accent',
  ok: 'from-ok/70 to-ok',
  warn: 'from-warn/70 to-warn',
  danger: 'from-danger/70 to-danger',
  glacier: 'from-glacier/60 to-glacier',
};

export function ProgressBar({
  value,
  tone = 'accent',
  className,
  height = 'xs',
  markerAt,
  label,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-surface2',
        height === 'xs' ? 'h-1' : 'h-1.5',
        className,
      )}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn('h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ease-out', toneClasses[tone])}
        style={{ width: `${clamped}%` }}
      />
      {typeof markerAt === 'number' && (
        <span
          className="absolute top-0 h-full w-px bg-ink/40"
          style={{ left: `${Math.min(100, Math.max(0, markerAt))}%` }}
        />
      )}
    </div>
  );
}
