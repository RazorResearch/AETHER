import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export type BadgeTone = 'neutral' | 'accent' | 'glacier' | 'ok' | 'warn' | 'danger' | 'muted';

const tones: Record<BadgeTone, string> = {
  neutral: 'border-line bg-surface2/60 text-ink-dim',
  accent: 'border-accent/30 bg-accent/[0.08] text-accent',
  glacier: 'border-glacier/30 bg-glacier/[0.08] text-glacier',
  ok: 'border-ok/30 bg-ok/[0.08] text-ok',
  warn: 'border-warn/30 bg-warn/[0.08] text-warn',
  danger: 'border-danger/30 bg-danger/[0.09] text-danger',
  muted: 'border-line/70 bg-transparent text-ink-mute',
};

const dotTones: Record<BadgeTone, string> = {
  neutral: 'bg-ink-mute',
  accent: 'bg-accent',
  glacier: 'bg-glacier',
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  muted: 'bg-ink-mute/70',
};

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
  mono?: boolean;
  /** Adds a soft pulse to the status dot (used for running states). */
  pulse?: boolean;
}

export function Badge({
  tone = 'neutral',
  children,
  dot = false,
  className,
  mono = false,
  pulse = false,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-1.5 py-[3px] text-[10.5px] font-medium leading-none',
        mono && 'font-mono uppercase tracking-[0.08em] text-[10px]',
        tones[tone],
        className,
      )}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5 items-center justify-center">
          {pulse && (
            <span className={cn('absolute h-2.5 w-2.5 animate-ping rounded-full opacity-40', dotTones[tone])} />
          )}
          <span className={cn('h-1.5 w-1.5 rounded-full', dotTones[tone])} />
        </span>
      )}
      {children}
    </span>
  );
}

/** Marks a value as generated locally rather than measured. */
export function ProvenanceBadge({
  kind = 'demo',
  className,
}: {
  kind?: 'demo' | 'simulated' | 'estimated';
  className?: string;
}) {
  const labels = {
    demo: 'Demo data',
    simulated: 'Simulated',
    estimated: 'Estimated',
  } as const;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border border-dashed border-accent/30 bg-accent/[0.04] px-1.5 py-[3px] font-mono text-[9px] uppercase tracking-[0.14em] text-accent/85',
        className,
      )}
      title="Generated locally for interface preview. Not measured from real hardware or models."
    >
      <span className="h-1 w-1 rounded-[1px] bg-accent/70" />
      {labels[kind]}
    </span>
  );
}
