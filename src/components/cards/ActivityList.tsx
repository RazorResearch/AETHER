import {
  Activity as ActivityIcon,
  BarChart3,
  Boxes,
  FlaskConical,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityCategory, ActivityEvent } from '@/types';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { formatRelative } from '@/utils/format';
import { cn } from '@/utils/cn';

const categoryIcon: Record<ActivityCategory, LucideIcon> = {
  Model: Boxes,
  Optimization: SlidersHorizontal,
  Experiment: FlaskConical,
  Benchmark: BarChart3,
  System: ActivityIcon,
};

export const statusTone: Record<ActivityEvent['status'], BadgeTone> = {
  Success: 'ok',
  Info: 'accent',
  Warning: 'warn',
  Failed: 'danger',
};

interface ActivityListProps {
  events: ActivityEvent[];
  limit?: number;
  className?: string;
}

/** Chronological event feed used on the Overview page. */
export function ActivityList({ events, limit, className }: ActivityListProps) {
  const visible = limit ? events.slice(0, limit) : events;

  return (
    <ol className={cn('relative', className)}>
      <span className="absolute bottom-2 left-[13px] top-2 w-px bg-line/60" aria-hidden="true" />
      {visible.map((event, index) => {
        const Icon = categoryIcon[event.category];
        return (
          <li
            key={event.id}
            className={cn(
              'relative flex gap-3 py-2.5 pl-0',
              index !== visible.length - 1 && 'border-b border-line/30',
            )}
          >
            <span className="relative z-10 mt-0.5 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded border border-line bg-surface2/60 text-ink-mute">
              <Icon className="h-3 w-3" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[12px] leading-snug text-ink-dim">{event.description}</p>
                <span className="shrink-0 font-mono text-[9.5px] tracking-tight text-ink-mute/80">
                  {formatRelative(event.timestamp)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute/70">
                  {event.type}
                </span>
                <span className="text-ink-mute/30">·</span>
                <Badge tone={statusTone[event.status]} mono>
                  {event.status}
                </Badge>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
