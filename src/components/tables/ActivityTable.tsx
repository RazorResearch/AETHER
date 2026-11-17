import type { ActivityEvent } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { statusTone } from '@/components/cards/ActivityList';
import { formatDate, formatTime } from '@/utils/format';

/** Full activity ledger: date, time, event type, description, status. */
export function ActivityTable({ events }: { events: ActivityEvent[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line/70">
            {['Date', 'Time', 'Category', 'Event', 'Description', 'Status'].map((heading) => (
              <th
                key={heading}
                scope="col"
                className="px-3 py-2 font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-ink-mute first:pl-5 last:pr-5 last:text-right"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr
              key={event.id}
              className="border-b border-line/30 transition-colors last:border-0 hover:bg-surface2/30"
            >
              <td className="whitespace-nowrap px-3 py-2.5 pl-5">
                <span className="font-mono text-[10.5px] text-ink-mute">{formatDate(event.timestamp)}</span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">
                <span className="font-mono text-[10.5px] tabular-nums text-ink-dim">
                  {formatTime(event.timestamp)}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-mute">
                  {event.category}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">
                <span className="rounded border border-line/70 px-1.5 py-[2px] font-mono text-[9px] text-ink-mute">
                  {event.type}
                </span>
              </td>
              <td className="max-w-[440px] px-3 py-2.5">
                <span className="text-[11.5px] leading-relaxed text-ink-dim">{event.description}</span>
              </td>
              <td className="px-3 py-2.5 pr-5 text-right">
                <Badge tone={statusTone[event.status]} dot>
                  {event.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
