import { useState } from 'react';
import { AlertTriangle, Cpu, HardDrive, MemoryStick, RefreshCw, Thermometer, Zap } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, ProvenanceBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { Sparkline } from '@/components/charts/Sparkline';
import { Gauge } from '@/components/charts/Gauge';
import { StatTile } from '@/components/cards/StatTile';
import { EngineOffline } from '@/components/engine/EngineOffline';
import { useAppStore } from '@/store/useAppStore';
import { useEngineStore } from '@/store/useEngineStore';
import { formatBytes, formatNumber, formatPercent, formatTime, percentOf, unitLabel } from '@/utils/format';
import { useT } from '@/i18n';

const dash = '—';

/** Hardware dashboard — every value is read by the engine (NVML, psutil). */
export function HardwarePage() {
  const hw = useEngineStore((s) => s.hardware);
  const history = useEngineStore((s) => s.hardwareHistory);
  const health = useEngineStore((s) => s.health);
  const connection = useEngineStore((s) => s.connection);
  const refreshHardware = useEngineStore((s) => s.refreshHardware);
  const unit = useAppStore((s) => s.settings.unit);
  const [refreshing, setRefreshing] = useState(false);
  const t = useT();

  const refresh = async () => {
    setRefreshing(true);
    await refreshHardware();
    setRefreshing(false);
  };

  const gpu = hw?.gpus[0];
  const vramPct = gpu ? percentOf(gpu.vram_used_bytes ?? 0, gpu.vram_total_bytes ?? 0) : 0;
  const ramPct = hw ? hw.memory.percent : 0;
  const vramTrend = history.map((h) => h.vramPct).filter((v): v is number => v != null);
  const ramTrend = history.map((h) => h.ramPct);
  const cpuTrend = history.map((h) => h.cpuUtil).filter((v): v is number => v != null);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('Hardware')}
        subtitle={t('Device envelope for local inference, read by the AETHER engine (NVML, psutil).')}
        meta={<ProvenanceBadge kind={connection === 'online' ? 'live' : 'offline'} />}
        actions={
          <Button
            variant="secondary"
            icon={<RefreshCw className={refreshing ? 'animate-spin' : undefined} />}
            onClick={() => void refresh()}
            disabled={connection !== 'online'}
          >
            {t('Refresh')}
          </Button>
        }
      />

      <EngineOffline />

      {connection === 'online' && !hw && (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Skeleton className="h-[220px]" />
          <Skeleton className="h-[220px]" />
        </div>
      )}

      {hw && (
        <>
          {hw.warnings.length > 0 && (
            <div className="mb-3 flex items-start gap-2.5 border-l-2 border-warn/60 pl-3">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warn/80" />
              <ul className="text-[13px] leading-relaxed text-ink-dim">
                {hw.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
            {/* ------------------------------- GPU ------------------------------- */}
            <Card className="xl:col-span-7">
              <CardHeader
                title={gpu?.name ?? t('No NVIDIA GPU detected')}
                hint={
                  gpu
                    ? `GPU ${gpu.index} · ${t('compute capability')} ${gpu.compute_capability ?? dash} · ${gpu.uuid ?? ''}`
                    : t('NVML is unavailable on this machine: AETHER runs in CPU mode.')
                }
                action={<Badge tone={hw.accelerator === 'cuda' ? 'ok' : 'neutral'} dot>{hw.accelerator}</Badge>}
              />
              <CardBody>
                {!gpu ? (
                  <EmptyState
                    compact
                    icon={<Cpu />}
                    title={t('CPU-only mode')}
                    description={t('No NVIDIA device was reported by NVML. Inference and benchmarks will run on the CPU.')}
                  />
                ) : (
                  <>
                    <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-center">
                      <div className="flex items-center gap-4">
                        <Gauge
                          value={vramPct}
                          size={112}
                          thickness={8}
                          valueLabel={
                            gpu.vram_used_bytes != null
                              ? formatNumber(gpu.vram_used_bytes / (unit === 'GB' ? 1e9 : 1024 ** 3), 1)
                              : dash
                          }
                          unit={unitLabel(unit)}
                          ariaLabel={t('GPU VRAM usage')}
                        />
                        <div>
                          <div className="font-mono text-[12px] uppercase tracking-[0.16em] text-ink-mute">
                            {t('vram in use (all processes)')}
                          </div>
                          <div className="readout mt-1 text-[14px] text-ink">
                            {gpu.vram_used_bytes != null ? formatBytes(gpu.vram_used_bytes, unit) : dash} /{' '}
                            {gpu.vram_total_bytes != null ? formatBytes(gpu.vram_total_bytes, unit) : dash}
                          </div>
                          <div className="mt-1 text-[13px] text-ink-mute">
                            {gpu.vram_free_bytes != null ? formatBytes(gpu.vram_free_bytes, unit) : dash} {t('free')}
                          </div>
                          <div className="mt-3">
                            <Sparkline values={vramTrend} width={122} height={26} tone="accent" />
                          </div>
                        </div>
                      </div>

                      <div className="grid flex-1 grid-cols-2 gap-x-5 gap-y-3.5 sm:grid-cols-4 2xl:grid-cols-2">
                        <StatTile
                          label={t('Utilization')}
                          value={gpu.utilization_gpu_percent != null ? formatPercent(gpu.utilization_gpu_percent) : dash}
                          detail={
                            gpu.utilization_memory_percent != null
                              ? `${t('memory controller')} ${formatPercent(gpu.utilization_memory_percent)}`
                              : t('SM busy time')
                          }
                        />
                        <StatTile
                          label={t('Temperature')}
                          value={
                            gpu.temperature_c != null ? (
                              <span className="flex items-baseline gap-1">
                                {gpu.temperature_c}
                                <span className="text-[12.5px] text-ink-mute">°C</span>
                              </span>
                            ) : (
                              dash
                            )
                          }
                          detail={t('Die sensor')}
                          badge={<Thermometer className="h-3 w-3 text-ink-mute/60" />}
                        />
                        <StatTile
                          label={t('Power')}
                          value={gpu.power_draw_w != null ? `${formatNumber(gpu.power_draw_w, 1)} W` : dash}
                          detail={gpu.power_limit_w != null ? `${t('limit')} ${formatNumber(gpu.power_limit_w, 0)} W` : undefined}
                          badge={<Zap className="h-3 w-3 text-ink-mute/60" />}
                        />
                        <StatTile
                          label={t('Sampling')}
                          value={<span className="text-[13.5px]">3 s</span>}
                          detail={`${t('last')} ${formatTime(hw.captured_at)} · ${t('energy counter')} ${gpu.energy_counter_supported ? t('yes') : t('no')}`}
                        />
                      </div>
                    </div>

                    <div className="mt-4 border-t border-line/40 pt-3">
                      <div className="mb-1.5 flex items-center justify-between font-mono text-[12px] uppercase tracking-[0.12em] text-ink-mute">
                        <span>{t('vram allocation')}</span>
                        <span>{formatPercent(vramPct, 1)}</span>
                      </div>
                      <ProgressBar value={vramPct} height="sm" tone={vramPct > 85 ? 'danger' : 'accent'} />
                    </div>
                  </>
                )}
              </CardBody>
            </Card>

            {/* --------------------------- memory + disk -------------------------- */}
            <div className="space-y-3 xl:col-span-5">
              <Card>
                <CardHeader title={t('Host RAM')} action={<MemoryStick className="h-3.5 w-3.5 text-ink-mute/60" />} />
                <CardBody>
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="readout text-[22px] font-medium leading-none text-ink">
                        {formatBytes(hw.memory.used_bytes, unit)}
                        <span className="ml-1 text-[13px] text-ink-mute">{t('used')}</span>
                      </div>
                      <div className="mt-1.5 text-[13px] text-ink-mute">
                        {t('{avail} available of {total}', { avail: formatBytes(hw.memory.available_bytes, unit), total: formatBytes(hw.memory.total_bytes, unit) })}
                      </div>
                    </div>
                    <Sparkline values={ramTrend} width={96} height={22} tone="glacier" />
                  </div>
                  <ProgressBar value={ramPct} height="sm" tone="glacier" className="mt-3" />
                  <div className="mt-2 flex justify-between font-mono text-[12px] text-ink-mute/70">
                    <span>{formatPercent(ramPct, 1)} {t('engaged')}</span>
                    <span>
                      swap {formatBytes(hw.memory.swap_used_bytes, unit)} / {formatBytes(hw.memory.swap_total_bytes, unit)}
                    </span>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title={t('Volumes')} hint={t('Engine data and model directories')} action={<HardDrive className="h-3.5 w-3.5 text-ink-mute/60" />} />
                <CardBody className="space-y-3">
                  {hw.disks.length === 0 && <p className="text-[13px] text-ink-mute">{t("No volume reported.")}</p>}
                  {hw.disks.map((d) => {
                    const p = percentOf(d.used_bytes, d.total_bytes);
                    return (
                      <div key={d.path}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-mono text-[12.5px] text-ink-dim" title={d.path}>
                            {d.path}
                          </span>
                          <span className="readout shrink-0 text-[13px] text-ink">
                            {formatBytes(d.free_bytes, unit)} {t('free')}
                          </span>
                        </div>
                        <ProgressBar value={p} height="sm" tone={p > 90 ? 'danger' : 'ok'} className="mt-1.5" />
                        <div className="mt-1 flex justify-between font-mono text-[12px] text-ink-mute/70">
                          <span>{formatBytes(d.used_bytes, unit)} {t('used')}</span>
                          <span>{formatBytes(d.total_bytes, unit)} {t('total')}</span>
                        </div>
                      </div>
                    );
                  })}
                </CardBody>
              </Card>
            </div>

            {/* ------------------------------- CPU ------------------------------- */}
            <Card className="xl:col-span-7">
              <CardHeader
                title={hw.cpu.model ?? 'CPU'}
                hint={`${t('{p} physical · {l} logical cores', { p: hw.cpu.physical_cores ?? dash, l: hw.cpu.logical_cores ?? dash })} · ${hw.cpu.architecture ?? ''}${hw.cpu.frequency_mhz ? ` · ${formatNumber(hw.cpu.frequency_mhz, 0)} MHz` : ''}`}
              />
              <CardBody>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="readout text-[22px] font-medium leading-none text-ink">
                    {hw.cpu.utilization_percent != null ? formatPercent(hw.cpu.utilization_percent) : dash}
                    <span className="ml-2 text-[13px] font-normal text-ink-mute">{t('aggregate load')}</span>
                  </div>
                  <Sparkline values={cpuTrend} width={140} height={24} tone="warn" />
                </div>

                <div className="mt-4 grid grid-cols-8 gap-1.5 sm:grid-cols-12">
                  {hw.cpu.per_core_utilization_percent.map((load, index) => (
                    <div key={index}>
                      <div
                        title={`${t('Core')} ${index} · ${formatNumber(load, 0)}%`}
                        className="relative h-7 overflow-hidden rounded-[3px] border border-line/60 bg-surface2"
                      >
                        <div
                          className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-accent/45 to-accent/80 transition-[height] duration-500"
                          style={{ height: `${Math.max(4, load)}%` }}
                        />
                      </div>
                      <span className="mt-1 block text-center font-mono text-[11.5px] text-ink-mute/60">
                        {String(index).padStart(2, '0')}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 border-t border-line/40 pt-2.5 font-mono text-[12px] text-ink-mute/70">
                  {t('per-logical-core load sampled over 100 ms')} · {formatTime(hw.captured_at)}
                </p>
              </CardBody>
            </Card>

            {/* ------------------------- software stack ------------------------- */}
            <Card className="xl:col-span-5">
              <CardHeader title={t('Software stack')} hint={t('Versions reported by the engine host')} />
              <CardBody className="space-y-2">
                {[
                  ['OS', `${hw.software.os} ${hw.software.os_release}`],
                  [t('NVIDIA driver'), hw.software.nvidia_driver_version],
                  [t('CUDA (driver max)'), hw.software.cuda_driver_version],
                  ['CUDA runtime (PyTorch)', hw.software.cuda_runtime_version],
                  ['NVML', hw.software.nvml_version],
                  ['Python', hw.software.python],
                  ['PyTorch', hw.software.torch_version],
                  ...(health?.engines ?? []).map((e) => [
                    e.name,
                    e.available ? `${t('available')}${e.version ? ` · ${e.version}` : ''}` : t('not available'),
                  ]),
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3 border-b border-line/30 pb-1.5 last:border-0">
                    <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-ink-mute">{label}</span>
                    <span className="truncate text-right text-[13px] text-ink-dim">{value ?? dash}</span>
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
