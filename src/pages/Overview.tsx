import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  FlaskConical,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, ProvenanceBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { MetricCard } from '@/components/cards/MetricCard';
import { StatTile } from '@/components/cards/StatTile';
import { ActivityList } from '@/components/cards/ActivityList';
import { PerformanceLegend, PerformanceTrendChart } from '@/components/charts/PerformanceTrendChart';
import { useTelemetry } from '@/hooks/useTelemetry';
import { useAppStore } from '@/store/useAppStore';
import { benchmarkRuns } from '@/data/demo';
import { toast } from '@/store/useToastStore';
import { formatGigabytes, formatNumber, formatRelative, percentOf } from '@/utils/format';

type Period = '7' | '14' | '30';

const buildTrend = (base: number, seed: number) =>
  Array.from({ length: 12 }, (_, index) =>
    Math.max(2, base + Math.sin(index * 0.85 + seed) * 5.5 + index * 0.35),
  );

/** Workspace home: hardware snapshot, activity and performance trend. */
export function OverviewPage() {
  const [period, setPeriod] = useState<Period>('14');
  const [refreshing, setRefreshing] = useState(false);

  const { snapshot, refresh } = useTelemetry({ intervalMs: 6000 });
  const models = useAppStore((state) => state.models);
  const experiments = useAppStore((state) => state.experiments);
  const activity = useAppStore((state) => state.activity);
  const unit = useAppStore((state) => state.settings.unit);

  const vramPercent = percentOf(snapshot.vramUsedGb, snapshot.vramTotalGb);
  const ramPercent = percentOf(snapshot.ramUsedGb, snapshot.ramTotalGb);

  const trends = useMemo(
    () => ({
      vram: buildTrend(vramPercent, 1),
      ram: buildTrend(ramPercent, 2.4),
      gpu: buildTrend(snapshot.gpuUtilization, 4),
      cpu: buildTrend(snapshot.cpuUtilization, 5.6),
    }),
    [vramPercent, ramPercent, snapshot.gpuUtilization, snapshot.cpuUtilization],
  );

  const lastModel = models[0];

  const handleRefresh = () => {
    setRefreshing(true);
    refresh();
    window.setTimeout(() => {
      setRefreshing(false);
      toast.success('Workspace refreshed', 'Simulated telemetry and demo series were reloaded.');
    }, 620);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Overview"
        subtitle="Local AI optimization workspace."
        code="workspace / overview"
        meta={<ProvenanceBadge />}
        actions={
          <>
            <Segmented<Period>
              ariaLabel="Performance window"
              value={period}
              onChange={setPeriod}
              options={[
                { value: '7', label: '7d' },
                { value: '14', label: '14d' },
                { value: '30', label: '30d' },
              ]}
            />
            <Button
              variant="secondary"
              icon={<RefreshCw className={refreshing ? 'animate-spin' : undefined} />}
              onClick={handleRefresh}
              loading={refreshing}
            >
              Refresh
            </Button>
          </>
        }
      />

      {/* ------------------------------ hardware ------------------------------ */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-dim">
            Hardware overview
          </h2>
          <ProvenanceBadge kind="simulated" />
        </div>
        <Link
          to="/hardware"
          className="focus-ring inline-flex items-center gap-1 rounded font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute transition-colors hover:text-accent"
        >
          full diagnostics
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {refreshing ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[124px] w-full rounded-lg" />
          ))
        ) : (
          <>
            <MetricCard
              label="GPU VRAM usage"
              value={formatNumber(snapshot.vramUsedGb, 1)}
              unit={unit}
              secondary={`of ${formatGigabytes(snapshot.vramTotalGb, unit)} engaged`}
              percent={vramPercent}
              trend={trends.vram}
              tone="accent"
              detail="Resident GPU memory reported by the simulation layer. A native bridge will read VRAM through NVML / CUDA once the desktop shell is available."
            />
            <MetricCard
              label="System RAM usage"
              value={formatNumber(snapshot.ramUsedGb, 1)}
              unit={unit}
              secondary={`of ${formatGigabytes(snapshot.ramTotalGb, unit)} allocated`}
              percent={ramPercent}
              trend={trends.ram}
              tone="glacier"
              detail="Host memory held by the runtime process tree, including memory-mapped weight pages. Values here are generated, not measured."
            />
            <MetricCard
              label="GPU utilization"
              value={formatNumber(snapshot.gpuUtilization, 0)}
              unit="%"
              secondary={`die temp ${snapshot.gpuTemperatureC} °C · simulated`}
              percent={snapshot.gpuUtilization}
              trend={trends.gpu}
              tone="ok"
              detail="Share of SM time the device spent executing work over the sampling window. High utilization is expected during decode."
            />
            <MetricCard
              label="CPU utilization"
              value={formatNumber(snapshot.cpuUtilization, 0)}
              unit="%"
              secondary={`${snapshot.cpuCores} logical cores · simulated`}
              percent={snapshot.cpuUtilization}
              trend={trends.cpu}
              tone="warn"
              detail="Aggregate processor load. Offloaded transformer layers execute here, so this rises when VRAM ceilings force CPU placement."
            />
          </>
        )}
      </div>

      {/* --------------------------- workspace + perf ------------------------- */}
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader
            kicker="performance overview"
            title="Decode throughput"
            hint="Tokens per second per model across the selected window."
            action={<Badge tone="accent" mono>demo series</Badge>}
          />
          <CardBody className="pb-3 pt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <PerformanceLegend />
              <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-mute/70">
                tok/s · batch 1 · simulated
              </span>
            </div>
            <PerformanceTrendChart days={Number(period)} />
            <p className="mt-2 border-t border-line/40 pt-2.5 text-[10.5px] leading-relaxed text-ink-mute">
              Demonstration series only. AETHER has not measured these values — the inference engine
              is not part of this build.
            </p>
          </CardBody>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader
            kicker="active workspace"
            title="Library state"
            action={
              <Link
                to="/models"
                className="focus-ring rounded font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-mute hover:text-accent"
              >
                library
              </Link>
            }
          />
          <CardBody className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <StatTile
                label="Models"
                value={models.length}
                badge={<Boxes className="h-3 w-3 text-ink-mute/60" />}
              />
              <StatTile
                label="Experiments"
                value={experiments.length}
                badge={<FlaskConical className="h-3 w-3 text-ink-mute/60" />}
              />
              <StatTile
                label="Benchmarks"
                value={benchmarkRuns.length}
                badge={<BarChart3 className="h-3 w-3 text-ink-mute/60" />}
              />
            </div>

            <div className="rounded-md border border-line/70 bg-raised/40 px-3 py-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
                  Last model used
                </span>
                {lastModel && <Badge tone="ok" dot>{lastModel.status}</Badge>}
              </div>
              {lastModel ? (
                <>
                  <div className="mt-2 text-[12.5px] font-medium leading-snug text-ink">
                    {lastModel.name}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-ink-mute">
                    {lastModel.quantization} · {lastModel.format} ·{' '}
                    {formatGigabytes(lastModel.sizeBytes / 1024 ** 3, unit)}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-ink-mute">
                    <span>registered {formatRelative(lastModel.importedAt)}</span>
                    <span className="font-mono uppercase tracking-[0.1em] text-ink-mute/70">
                      session 01
                    </span>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-[11.5px] text-ink-mute">No model registered yet.</p>
              )}
            </div>

            <Link
              to="/optimization"
              className="focus-ring inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-line bg-surface2/70 text-[12px] font-medium text-ink transition-colors hover:border-accent/40 hover:text-accent"
            >
              Configure an optimization
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardBody>
        </Card>
      </div>

      {/* ------------------------------ activity ------------------------------ */}
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader
            kicker="recent activity"
            title="Event stream"
            action={
              <Link
                to="/activity"
                className="focus-ring inline-flex items-center gap-1 rounded font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-mute hover:text-accent"
              >
                view log
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            }
          />
          {activity.length === 0 ? (
            <CardBody>
              <EmptyState
                compact
                icon={<BarChart3 />}
                title="No events recorded"
                description="Workspace events will appear here as soon as you register models or experiments."
              />
            </CardBody>
          ) : (
            <CardBody className="py-1.5">
              <ActivityList events={activity} limit={6} />
            </CardBody>
          )}
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader
            kicker="library snapshot"
            title="Registered models"
            action={<ProvenanceBadge />}
          />
          <CardBody className="px-0 py-0">
            {models.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  compact
                  icon={<Boxes />}
                  title="Library is empty"
                  description="Register a local model to start configuring optimization profiles."
                  action={
                    <Link
                      to="/models"
                      className="focus-ring inline-flex h-8 items-center rounded-md bg-accent px-3 text-[12px] font-semibold text-[#041016]"
                    >
                      Open library
                    </Link>
                  }
                />
              </div>
            ) : (
              <ul className="divide-y divide-line/40">
                {models.slice(0, 5).map((model) => (
                  <li key={model.id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] text-ink-dim">{model.name}</div>
                      <div className="font-mono text-[9.5px] text-ink-mute/80">
                        {model.quantization} · {formatGigabytes(model.sizeBytes / 1024 ** 3, unit)}
                      </div>
                    </div>
                    <span className="readout text-[10.5px] text-ink-mute">{model.parameters}</span>
                    <Badge
                      tone={model.status === 'Unavailable' ? 'danger' : model.status === 'Ready' ? 'ok' : 'neutral'}
                    >
                      {model.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-line/40 px-5 py-2.5">
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-mute/60">
                demo library · stored locally
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
