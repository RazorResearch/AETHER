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
                className="px-3 py-2 font-mono text-[11.5px] font-normal uppercase tracking-[0.08em] text-ink-mute/70 first:pl-4 last:pr-4 last:text-right"
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
              className="border-b border-line/30 transition-colors last:border-0 hover:bg-surface2/25"
            >
              <td className="whitespace-nowrap py-2 pl-4 pr-3">
                <span className="font-mono text-[12.5px] text-ink-mute">{formatDate(event.timestamp)}</span>
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                <span className="readout text-[12.5px] text-ink-dim">
                  {formatTime(event.timestamp)}
                </span>
              </td>
              <td className="px-3 py-2">
                <span className="font-mono text-[12px] text-ink-mute/80">{event.category}</span>
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                <span className="font-mono text-[12px] text-ink-mute">{event.type}</span>
              </td>
              <td className="max-w-[440px] px-3 py-2">
                <span className="text-[13px] leading-snug text-ink-dim">{event.description}</span>
              </td>
              <td className="py-2 pl-3 pr-4 text-right">
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
