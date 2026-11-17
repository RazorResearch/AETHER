import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/utils/cn';

interface InfoHintProps {
  /** Scientific detail revealed on hover / keyboard focus. */
  content: ReactNode;
  label?: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  /** Hide the (i) glyph when the label itself is the affordance. */
  showIcon?: boolean;
}

/**
 * Metric tooltip. Uses group-hover + group-focus-within so it is reachable by
 * keyboard, and stays inside the panel flow (no portal needed).
 */
export function InfoHint({
  content,
  label,
  className,
  align = 'left',
  showIcon = true,
}: InfoHintProps) {
  const position =
    align === 'right' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0';

  return (
    <span
      className={cn('group/hint relative inline-flex items-center gap-1', className)}
      tabIndex={0}
    >
      {label && <span className="border-b border-dotted border-ink-mute/40">{label}</span>}
      {showIcon && <Info className="h-3 w-3 shrink-0 text-ink-mute/60" aria-hidden="true" />}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute top-full z-30 mt-2 w-[240px] rounded-sm border border-line bg-raised px-2.5 py-2 text-left text-[13px] font-normal leading-relaxed tracking-normal text-ink-dim opacity-0',
          'transition-opacity duration-100 group-hover/hint:opacity-100 group-focus-within/hint:opacity-100',
          position,
        )}
      >
        {content}
      </span>
    </span>
  );
}
