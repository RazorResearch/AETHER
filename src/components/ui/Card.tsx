import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

/** Flat surface used by every panel. No shadow, no decorative sheen. */
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={cn('rounded-md border border-line/80 bg-surface', className)} {...rest}>
      {children}
    </section>
  );
}

interface CardHeaderProps {
  title: ReactNode;
  kicker?: string;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
  dense?: boolean;
}

export function CardHeader({
  title,
  kicker,
  hint,
  action,
  className,
  dense = false,
}: CardHeaderProps) {
  return (
    <header
      className={cn(
        'flex items-start justify-between gap-4 border-b border-line/60',
        dense ? 'px-3.5 py-2.5' : 'px-4 py-3',
        className,
      )}
    >
      <div className="min-w-0">
        {kicker && <div className="mono-label mb-1.5">{kicker}</div>}
        <h2 className="truncate text-[14px] font-medium tracking-[-0.01em] text-ink">{title}</h2>
        {hint && (
          <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-ink-mute">{hint}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-4 py-3.5', className)} {...rest}>
      {children}
    </div>
  );
}
