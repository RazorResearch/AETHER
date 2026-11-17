import type { ActivityEvent } from '@/types';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { formatRelative } from '@/utils/format';
import { cn } from '@/utils/cn';
import { useT } from '@/i18n';

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

/** Compact chronological log: time, event, status. */
export function ActivityList({ events, limit, className }: ActivityListProps) {
  const visible = limit ? events.slice(0, limit) : events;
  const t = useT();

  return (
    <ol className={cn('divide-y divide-line/40', className)}>
      {visible.map((event) => (
        <li
          key={event.id}
          className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-start gap-3 py-2"
        >
          <span className="readout pt-[2px] text-[12px] text-ink-mute/80">
            {formatRelative(event.timestamp)}
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] leading-snug text-ink-dim">{event.description}</p>
            <span className="mt-0.5 block font-mono text-[11.5px] uppercase tracking-[0.06em] text-ink-mute/60">
              {event.type}
            </span>
          </div>
          <Badge tone={statusTone[event.status]} mono>
            {t(event.status)}
          </Badge>
        </li>
      ))}
    </ol>
  );
}
