import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-md border border-dashed border-line/80 bg-raised/30 text-center',
        compact ? 'px-5 py-8' : 'px-6 py-14',
        className,
      )}
    >
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface text-ink-mute [&>svg]:h-4 [&>svg]:w-4">
        {icon}
      </div>
      <h3 className="text-[14.5px] font-medium text-ink">{title}</h3>
      <p className="mt-1.5 max-w-[42ch] text-[13.5px] leading-relaxed text-ink-mute">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
