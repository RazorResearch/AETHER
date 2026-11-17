import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface PageHeaderProps {
  title: string;
  subtitle: string;
  /** Monospace context line, e.g. "workspace / library". */
  code?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, code, actions, meta, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {code && <div className="mono-label mb-2">{code}</div>}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-ink">
            {title}
          </h1>
          {meta}
        </div>
        <p className="mt-1.5 text-[12.5px] text-ink-mute">{subtitle}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
