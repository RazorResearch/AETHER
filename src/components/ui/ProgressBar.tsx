import { cn } from '@/utils/cn';

interface ProgressBarProps {
  /** 0–100 */
  value: number;
  tone?: 'accent' | 'ok' | 'warn' | 'danger' | 'glacier';
  className?: string;
  height?: 'xs' | 'sm';
  /** Adds a threshold marker at the given percentage. */
  markerAt?: number;
  label?: string;
}

const toneClasses = {
  accent: 'bg-accent',
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  glacier: 'bg-glacier',
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
        'relative w-full overflow-hidden rounded-[1px] bg-surface2',
        height === 'xs' ? 'h-[3px]' : 'h-[5px]',
        className,
      )}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn('h-full transition-[width] duration-500', toneClasses[tone])}
        style={{ width: `${clamped}%` }}
      />
      {typeof markerAt === 'number' && (
        <span
          className="absolute top-0 h-full w-px bg-ink/50"
          style={{ left: `${Math.min(100, Math.max(0, markerAt))}%` }}
        />
      )}
    </div>
  );
}
