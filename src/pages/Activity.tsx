import { useMemo, useState } from 'react';
import { Activity as ActivityIcon, Search } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProvenanceBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Segmented, TextInput } from '@/components/ui/Field';
import { ActivityTable } from '@/components/tables/ActivityTable';
import { EngineOffline } from '@/components/engine/EngineOffline';
import { toActivityEvent } from '@/api/adapters';
import { activityCategories } from '@/store/defaults';
import { useEngineStore } from '@/store/useEngineStore';
import type { ActivityCategory } from '@/types';
import { formatRelative } from '@/utils/format';
import { useT } from '@/i18n';

type Filter = 'All' | ActivityCategory;

/** Engine audit log (GET /activity), newest first. */
export function ActivityPage() {
  const raw = useEngineStore((s) => s.activity);
  const connection = useEngineStore((s) => s.connection);
  const activity = useMemo(() => raw.map(toActivityEvent), [raw]);

  const [category, setCategory] = useState<Filter>('All');
  const [query, setQuery] = useState('');
  const t = useT();

  const counts = useMemo(() => {
    const base: Record<string, number> = { All: activity.length };
    activityCategories.forEach((item) => {
      base[item] = activity.filter((event) => event.category === item).length;
    });
    return base;
  }, [activity]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return activity.filter(
      (event) =>
        (category === 'All' || event.category === category) &&
        (!needle || event.description.toLowerCase().includes(needle) || event.type.toLowerCase().includes(needle)),
    );
  }, [activity, category, query]);

  const lastEvent = activity[0];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('Activity')}
        subtitle={t('Audit log written by the AETHER engine: imports, experiments, benchmarks, jobs.')}
        meta={<ProvenanceBadge kind={connection === 'online' ? 'live' : 'offline'} />}
      />

      <EngineOffline compact />

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              {t('Events')}
              <span className="readout text-[13px] font-normal text-ink-mute">
                {filtered.length}/{activity.length}
              </span>
            </span>
          }
          hint={lastEvent ? t('Last event {when} · newest first · 500 most recent', { when: formatRelative(lastEvent.timestamp) }) : t('No events recorded yet.')}
        />

        <div className="flex flex-wrap items-center gap-2 border-b border-line/40 px-5 py-2.5">
          <Segmented<Filter>
            ariaLabel={t('Filter activity by category')}
            value={category}
            onChange={setCategory}
            options={[
              { value: 'All', label: t('All'), count: counts.All },
              ...activityCategories.map((item) => ({ value: item, label: t(item), count: counts[item] ?? 0 })),
            ]}
          />
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('Search events…')}
            icon={<Search />}
            aria-label={t('Search activity')}
            wrapperClassName="ml-auto w-full max-w-[240px]"
          />
        </div>

        {activity.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={<ActivityIcon />}
              title={t('No activity recorded')}
              description={t('Engine events appear here as soon as you import a model or start a job.')}
            />
          </CardBody>
        ) : filtered.length === 0 ? (
          <CardBody>
            <EmptyState
              compact
              icon={<Search />}
              title={t('No matching events')}
              description={t('Try another category or clear the search term.')}
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCategory('All');
                    setQuery('');
                  }}
                >
                  {t('Reset filters')}
                </Button>
              }
            />
          </CardBody>
        ) : (
          <ActivityTable events={filtered} />
        )}
      </Card>
    </div>
  );
}
