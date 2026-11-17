import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BarChart3, Boxes, FlaskConical } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, ProvenanceBadge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { MetricCard } from '@/components/cards/MetricCard';
import { StatTile } from '@/components/cards/StatTile';
import { ActivityList } from '@/components/cards/ActivityList';
import { EngineOffline } from '@/components/engine/EngineOffline';
import { formatParams, toActivityEvent } from '@/api/adapters';
import { useAppStore } from '@/store/useAppStore';
import { useEngineStore } from '@/store/useEngineStore';
import { formatBytes, formatNumber, formatRelative, unitLabel } from '@/utils/format';
import { useT } from '@/i18n';

const dash = '—';

/** Workspace home: live hardware, measured throughput, library and engine events. */
export function OverviewPage() {
  const hw = useEngineStore((s) => s.hardware);
  const history = useEngineStore((s) => s.hardwareHistory);
  const models = useEngineStore((s) => s.models);
  const experiments = useEngineStore((s) => s.experiments);
  const benchmarks = useEngineStore((s) => s.benchmarks);
  const rawActivity = useEngineStore((s) => s.activity);
  const connection = useEngineStore((s) => s.connection);
  const unit = useAppStore((s) => s.settings.unit);
  const online = connection === 'online';
  const t = useT();

  const activity = useMemo(() => rawActivity.map(toActivityEvent), [rawActivity]);
  const gpu = hw?.gpus[0];
  const trend = (key: 'vramPct' | 'ramPct' | 'gpuUtil' | 'cpuUtil') =>
    history.map((h) => h[key]).filter((v): v is number => v != null);
  const vramPct = gpu?.vram_used_bytes != null && gpu.vram_total_bytes ? (gpu.vram_used_bytes / gpu.vram_total_bytes) * 100 : 0;
  const div = unit === 'GB' ? 1e9 : 1024 ** 3;

  const measured = useMemo(
    () =>
      benchmarks
        .filter((b) => b.status === 'completed' && b.record?.gen_tps)
        .slice(0, 8)
        .map((b) => ({
          id: b.id,
          label: b.record!.model.name,
          detail: `${b.record!.model.quantization ?? ''} · KV ${b.spec.params?.runtime?.cache_type_k ?? 'f16'}/${b.spec.params?.runtime?.cache_type_v ?? 'f16'} · ngl ${b.spec.params?.runtime?.n_gpu_layers ?? 99}`,
          tps: b.record!.gen_tps!.mean,
          std: b.record!.gen_tps!.std ?? 0,
          at: b.created_at,
        })),
    [benchmarks],
  );
  const maxTps = Math.max(1, ...measured.map((m) => m.tps));
  const lastModel = models.reduce<(typeof models)[number] | null>(
    (latest, m) => (!latest || m.created_at > latest.created_at ? m : latest),
    null,
  );

  return (
    <div className="animate-fade-in">
      <PageHeader title={t('Overview')} subtitle={t('Local AI optimization workspace.')} meta={<ProvenanceBadge kind={online ? 'live' : 'offline'} />} />

      <EngineOffline />

      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13.5px] font-medium text-ink-dim">{t("Hardware")}</h2>
        <Link to="/hardware" className="focus-ring inline-flex items-center gap-1 rounded-sm text-[12.5px] text-ink-mute transition-colors hover:text-ink">
          {t('Full diagnostics')} <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 gap-px bg-line/50 sm:grid-cols-2 xl:grid-cols-4">
          {!hw && connection === 'offline' ? (
            <div className="col-span-full bg-surface px-4 py-8 text-center text-[13.5px] text-ink-mute">
              {t('No hardware data — the engine is offline.')}
            </div>
          ) : !hw ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[118px] w-full rounded-none" />)
          ) : (
            <>
              <MetricCard
                label={t('GPU VRAM usage')}
                value={gpu?.vram_used_bytes != null ? formatNumber(gpu.vram_used_bytes / div, 1) : dash}
                unit={gpu ? unitLabel(unit) : ''}
                secondary={gpu?.vram_total_bytes != null ? t('of {total} · {name}', { total: formatBytes(gpu.vram_total_bytes, unit), name: gpu.name ?? '' }) : t('no NVIDIA GPU detected')}
                percent={vramPct}
                trend={trend('vramPct')}
                tone="accent"
                detail={t('Device memory in use by all processes, read through NVML.')}
              />
              <MetricCard
                label={t('System RAM usage')}
                value={formatNumber(hw.memory.used_bytes / div, 1)}
                unit={unitLabel(unit)}
                secondary={t('of {total} · {avail} available', { total: formatBytes(hw.memory.total_bytes, unit), avail: formatBytes(hw.memory.available_bytes, unit) })}
                percent={hw.memory.percent}
                trend={trend('ramPct')}
                tone="glacier"
                detail={t('Host memory in use, read through psutil.')}
              />
              <MetricCard
                label={t('GPU utilization')}
                value={gpu?.utilization_gpu_percent != null ? formatNumber(gpu.utilization_gpu_percent, 0) : dash}
                unit={gpu?.utilization_gpu_percent != null ? '%' : ''}
                secondary={gpu?.temperature_c != null ? `${t('die')} ${gpu.temperature_c} °C · ${gpu.power_draw_w != null ? `${formatNumber(gpu.power_draw_w, 0)} W` : ''}` : t('not available')}
                percent={gpu?.utilization_gpu_percent ?? 0}
                trend={trend('gpuUtil')}
                tone="ok"
                detail={t('Share of time the GPU executed kernels over the last NVML sample period.')}
              />
              <MetricCard
                label={t('CPU utilization')}
                value={hw.cpu.utilization_percent != null ? formatNumber(hw.cpu.utilization_percent, 0) : dash}
                unit="%"
                secondary={t('{n} logical cores · {model}', { n: hw.cpu.logical_cores ?? dash, model: hw.cpu.model ?? '' })}
                percent={hw.cpu.utilization_percent ?? 0}
                trend={trend('cpuUtil')}
                tone="warn"
                detail={t('Mean load over all logical cores (100 ms sample).')}
              />
            </>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-line/50 px-4 py-2 text-[12.5px] text-ink-mute">
          <ProvenanceBadge kind={online ? 'live' : 'offline'} />
          <span>
            {hw ? t("Read by the engine every 3 s · sparklines show this session's samples ({n})", { n: history.length }) : t('Waiting for the engine…')}
          </span>
        </div>
      </Card>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader title={t('Measured decode throughput')} hint={t('Latest completed benchmarks (llama-bench tg, mean ± std).')} action={<ProvenanceBadge kind="measured" />} />
          <CardBody>
            {measured.length === 0 ? (
              <EmptyState
                compact
                icon={<BarChart3 />}
                title={t('No measurement yet')}
                description={t('Throughput appears here once a benchmark has actually run. Nothing is extrapolated.')}
                action={
                  <Link to="/benchmarks" className="focus-ring inline-flex h-8 items-center rounded border border-line px-3 text-[13.5px] text-ink-dim hover:text-ink">
                    {t('Open benchmarks')}
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-2.5">
                {measured.map((m) => (
                  <li key={m.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[13.5px] text-ink-dim">
                        {m.label} <span className="font-mono text-[12px] text-ink-mute">{m.detail}</span>
                      </span>
                      <span className="readout shrink-0 text-[13px] text-ink">
                        {formatNumber(m.tps, 1)} <span className="text-ink-mute">± {formatNumber(m.std, 1)} tok/s</span>
                      </span>
                    </div>
                    <div className="mt-1 h-[5px] bg-surface2">
                      <div className="h-full bg-accent" style={{ width: `${(m.tps / maxTps) * 100}%` }} />
                    </div>
                    <div className="mt-0.5 font-mono text-[11.5px] text-ink-mute/70">{formatRelative(m.at)}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader title={t('Library state')} action={<Link to="/models" className="focus-ring rounded-sm text-[12.5px] text-ink-mute hover:text-ink">{t('library')}</Link>} />
          <CardBody className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <StatTile label={t('Models')} value={models.length} badge={<Boxes className="h-3 w-3 text-ink-mute/60" />} />
              <StatTile label={t('Experiments')} value={experiments.length} badge={<FlaskConical className="h-3 w-3 text-ink-mute/60" />} />
              <StatTile label={t('Benchmarks')} value={benchmarks.length} badge={<BarChart3 className="h-3 w-3 text-ink-mute/60" />} />
            </div>
            <div className="rounded-md border border-line/70 bg-raised/40 px-3 py-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-mute">{t("Last imported")}</span>
                {lastModel && (
                  <Badge tone={lastModel.status === 'available' ? 'ok' : 'danger'} dot>
                    {t(lastModel.status)}
                  </Badge>
                )}
              </div>
              {lastModel ? (
                <>
                  <div className="mt-2 text-[14px] font-medium leading-snug text-ink">{lastModel.name}</div>
                  <div className="mt-1 font-mono text-[12.5px] text-ink-mute">
                    {lastModel.quantization ?? dash} · {lastModel.architecture ?? dash} · {formatParams(lastModel.n_params)} ·{' '}
                    {formatBytes(lastModel.file_size_bytes, unit)}
                  </div>
                  <div className="mt-2 text-[12.5px] text-ink-mute">{t('registered {when}', { when: formatRelative(lastModel.created_at) })}</div>
                </>
              ) : (
                <p className="mt-2 text-[13.5px] text-ink-mute">{t("No model registered yet.")}</p>
              )}
            </div>
            <Link
              to="/optimization"
              className="focus-ring inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-line bg-surface2/70 text-[13.5px] font-medium text-ink transition-colors hover:border-accent/40 hover:text-accent"
            >
              {t('Estimate & optimize')} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardBody>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader
            title={t('Engine events')}
            action={
              <Link to="/activity" className="focus-ring inline-flex items-center gap-1 rounded font-mono text-[12px] uppercase tracking-[0.12em] text-ink-mute hover:text-accent">
                {t('view log')} <ArrowUpRight className="h-3 w-3" />
              </Link>
            }
          />
          {activity.length === 0 ? (
            <CardBody>
              <EmptyState compact icon={<BarChart3 />} title={t('No events recorded')} description={t('Engine events appear as soon as you import a model or run a job.')} />
            </CardBody>
          ) : (
            <CardBody className="py-1.5">
              <ActivityList events={activity} limit={6} />
            </CardBody>
          )}
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader title={t('Registered models')} action={<ProvenanceBadge kind={online ? 'live' : 'offline'} />} />
          <CardBody className="px-0 py-0">
            {models.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  compact
                  icon={<Boxes />}
                  title={t('Library is empty')}
                  description={t('Import a local GGUF file to analyse it and estimate its memory footprint.')}
                  action={
                    <Link to="/models" className="focus-ring inline-flex h-8 items-center rounded border border-ink/10 bg-ink px-3 text-[13.5px] font-medium text-base">
                      {t('Open library')}
                    </Link>
                  }
                />
              </div>
            ) : (
              <ul className="divide-y divide-line/40">
                {models.slice(0, 6).map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] text-ink-dim">{m.name}</div>
                      <div className="font-mono text-[12px] text-ink-mute/80">
                        {m.quantization ?? m.format} · {formatBytes(m.file_size_bytes, unit)}
                      </div>
                    </div>
                    <span className="readout text-[13px] text-ink-mute">{formatParams(m.n_params)}</span>
                    <Badge tone={m.status === 'available' ? 'ok' : 'danger'}>{t(m.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
