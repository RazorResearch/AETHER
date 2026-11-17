import { useMemo, useState } from 'react';
import { Activity as ActivityIcon, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, ProvenanceBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Segmented, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ActivityTable } from '@/components/tables/ActivityTable';
import { useAppStore } from '@/store/useAppStore';
import { activityCategories } from '@/store/defaults';
import { toast } from '@/store/useToastStore';
import type { ActivityCategory } from '@/types';
import { formatRelative } from '@/utils/format';

type Filter = 'All' | ActivityCategory;

/** Event ledger with category filters and local search. */
export function ActivityPage() {
  const activity = useAppStore((state) => state.activity);
  const clearActivity = useAppStore((state) => state.clearActivity);

  const [category, setCategory] = useState<Filter>('All');
  const [query, setQuery] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const counts = useMemo(() => {
    const base: Record<string, number> = { All: activity.length };
    activityCategories.forEach((item) => {
      base[item] = activity.filter((event) => event.category === item).length;
    });
    return base;
  }, [activity]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return activity.filter((event) => {
      const matchesCategory = category === 'All' || event.category === category;
      const matchesQuery =
        needle.length === 0 ||
        event.description.toLowerCase().includes(needle) ||
        event.type.toLowerCase().includes(needle);
      return matchesCategory && matchesQuery;
    });
  }, [activity, category, query]);

  const handleClear = () => {
    clearActivity();
    setConfirmClear(false);
    toast.info('Log cleared', 'All local activity events were removed.');
  };

  const lastEvent = activity[0];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Activity"
        subtitle="Chronological log of workspace events. Everything stays on this machine."
        code="system / activity"
        meta={<ProvenanceBadge />}
        actions={
          <Button
            variant="outline"
            icon={<Trash2 />}
            onClick={() => setConfirmClear(true)}
            disabled={activity.length === 0}
          >
            Clear log
          </Button>
        }
      />

      <Card>
        <CardHeader
          kicker="event ledger"
          title={
            <span className="flex items-center gap-2">
              Events
              <span className="readout text-[11px] font-normal text-ink-mute">
                {filtered.length}/{activity.length}
              </span>
            </span>
          }
          hint={
            lastEvent
              ? `Last event ${formatRelative(lastEvent.timestamp)} · newest first`
              : 'No events recorded yet.'
          }
          action={<Badge tone="muted" dot>local only</Badge>}
        />

        <div className="flex flex-wrap items-center gap-2 border-b border-line/40 px-5 py-2.5">
          <Segmented<Filter>
            ariaLabel="Filter activity by category"
            value={category}
            onChange={setCategory}
            options={[
              { value: 'All', label: 'All', count: counts.All },
              ...activityCategories.map((item) => ({
                value: item,
                label: item,
                count: counts[item] ?? 0,
              })),
            ]}
          />
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search events…"
            icon={<Search />}
            aria-label="Search activity"
            wrapperClassName="ml-auto w-full max-w-[240px]"
          />
        </div>

        {activity.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={<ActivityIcon />}
              title="No activity recorded"
              description="Register a model, create an experiment or export a report and the event will appear here."
            />
          </CardBody>
        ) : filtered.length === 0 ? (
          <CardBody>
            <EmptyState
              compact
              icon={<Search />}
              title="No matching events"
              description="Try another category or clear the search term."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCategory('All');
                    setQuery('');
                  }}
                >
                  Reset filters
                </Button>
              }
            />
          </CardBody>
        ) : (
          <ActivityTable events={filtered} />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/40 px-5 py-2.5">
          <p className="text-[10.5px] text-ink-mute">
            Events are kept in localStorage and capped at 200 entries.
          </p>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute/60">
            no telemetry uploaded
          </span>
        </div>
      </Card>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear the activity log?"
        kicker="confirmation"
        description="All locally stored events will be deleted. Models and experiments are not affected."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button variant="danger" icon={<Trash2 />} onClick={handleClear}>
              Clear log
            </Button>
          </>
        }
      >
        <p className="text-[11.5px] leading-relaxed text-ink-dim">
          {activity.length} events will be removed from{' '}
          <span className="font-mono text-ink-mute">aether.workspace.v1</span>. This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
