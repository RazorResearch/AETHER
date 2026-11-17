import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export type BadgeTone = 'neutral' | 'accent' | 'glacier' | 'ok' | 'warn' | 'danger' | 'muted';

/* Outlined, low-chroma status marks — no tinted pills. */
const tones: Record<BadgeTone, string> = {
  neutral: 'border-line/80 text-ink-mute',
  accent: 'border-accent/30 text-accent',
  glacier: 'border-glacier/30 text-glacier',
  ok: 'border-ok/30 text-ok',
  warn: 'border-warn/35 text-warn',
  danger: 'border-danger/35 text-danger',
  muted: 'border-line/60 text-ink-mute/80',
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
  /** Kept for API compatibility; status marks no longer pulse. */
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
  void pulse;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-1.5 py-[2px] text-[12.5px] leading-none',
        mono && 'font-mono text-[12px] uppercase tracking-[0.06em]',
        tones[tone],
        className,
      )}
    >
      {dot && <span className={cn('h-[4px] w-[4px] rounded-[1px]', dotTones[tone])} />}
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
        'inline-flex items-center gap-1.5 rounded-sm border border-line/80 px-1.5 py-[2px] font-mono text-[11.5px] uppercase tracking-[0.12em] text-ink-mute',
        className,
      )}
      title="Generated locally for interface preview. Not measured from real hardware or models."
    >
      <span className="h-[4px] w-[4px] rounded-[1px] bg-accent/80" />
      {labels[kind]}
    </span>
  );
}
