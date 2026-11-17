import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface StatTileProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  badge?: ReactNode;
  className?: string;
}

/** Small bordered readout used inside summary panels. */
export function StatTile({ label, value, detail, badge, className }: StatTileProps) {
  return (
    <div className={cn('rounded-md border border-line/70 bg-raised/40 px-3 py-2.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
          {label}
        </span>
        {badge}
      </div>
      <div className="readout mt-1.5 text-[15px] font-medium leading-none text-ink">{value}</div>
      {detail && <div className="mt-1.5 text-[10px] leading-snug text-ink-mute">{detail}</div>}
    </div>
  );
}
