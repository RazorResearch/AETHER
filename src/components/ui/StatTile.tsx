import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface StatTileProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  badge?: ReactNode;
  className?: string;
}

/** Borderless readout: a label, a number, an optional annotation. */
export function StatTile({ label, value, detail, badge, className }: StatTileProps) {
  return (
    <div className={cn('border-t border-line/70 pt-2.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="mono-label text-[12px]">{label}</span>
        {badge}
      </div>
      <div className="readout mt-1.5 text-[18px] leading-none text-ink">{value}</div>
      {detail && <div className="mt-1.5 text-[12.5px] leading-snug text-ink-mute">{detail}</div>}
    </div>
  );
}
