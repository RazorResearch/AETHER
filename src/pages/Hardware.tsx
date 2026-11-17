import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Cpu,
  HardDrive,
  MemoryStick,
  Plug,
  RefreshCw,
  Thermometer,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, ProvenanceBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Segmented } from '@/components/ui/Field';
import { InfoHint } from '@/components/ui/Tooltip';
import { Sparkline } from '@/components/charts/Sparkline';
import { Gauge } from '@/components/charts/Gauge';
import { StatTile } from '@/components/cards/StatTile';
import { useTelemetry } from '@/hooks/useTelemetry';
import { useAppStore } from '@/store/useAppStore';
import { toast } from '@/store/useToastStore';
import { TELEMETRY_BRIDGE } from '@/utils/systemBridge';
import { formatGigabytes, formatNumber, formatPercent, formatTime, percentOf } from '@/utils/format';

/**
 * Hardware dashboard.
 *
 * Every number is simulated by hooks/useTelemetry. The page states this
 * explicitly and offers a bridge test that fails honestly.
 */
export function HardwarePage() {
  const [mode, setMode] = useState<'live' | 'paused'>('live');
  const { snapshot, isLoading, refresh } = useTelemetry({ live: mode === 'live', intervalMs: 4200 });
  const unit = useAppStore((state) => state.settings.unit);

  const vramPct = percentOf(snapshot.vramUsedGb, snapshot.vramTotalGb);
  const ramPct = percentOf(snapshot.ramUsedGb, snapshot.ramTotalGb);
  const diskPct = percentOf(snapshot.diskUsedGb, snapshot.diskTotalGb);
  const diskFree = snapshot.diskTotalGb - snapshot.diskUsedGb;

  const vramTrend = Array.from({ length: 14 }, (_, index) =>
    Math.max(2, vramPct + Math.sin(index * 0.7) * 8),
  );

  const testBridge = () => {
    toast.error(
      'Telemetry bridge unavailable',
      'No native host is attached. A Tauri/Python bridge is required to read real GPU counters.',
    );
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Hardware"
        subtitle="Device envelope for local inference. Values are simulated until a native bridge is attached."
        code="workspace / hardware"
        meta={<ProvenanceBadge kind="simulated" />}
        actions={
          <>
            <Segmented
              ariaLabel="Telemetry mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'live', label: 'Live' },
                { value: 'paused', label: 'Paused' },
              ]}
            />
            <Button
              variant="secondary"
              icon={<RefreshCw className={isLoading ? 'animate-spin' : undefined} />}
              onClick={refresh}
              loading={isLoading}
            >
              Refresh
            </Button>
          </>
        }
      />

      <div className="mb-3 flex items-start gap-2.5 rounded-md border border-warn/25 bg-warn/[0.04] px-3.5 py-2.5">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
        <div className="text-[11.5px] leading-relaxed text-ink-dim">
          <span className="font-medium text-warn">Simulated telemetry.</span> A browser cannot read GPU
          VRAM, temperatures or per-core load. AETHER generates these values locally and never claims
          they were detected. Device names are placeholders.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        {/* ------------------------------- GPU ------------------------------- */}
        <Card className="xl:col-span-7">
          <CardHeader
            kicker="graphics device"
            title={snapshot.gpuName}
            hint="Placeholder descriptor — no device query is performed."
            action={<Badge tone="warn" dot>simulated</Badge>}
          />
          <CardBody>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex items-center gap-4">
                <Gauge
                  value={vramPct}
                  size={112}
                  thickness={8}
                  valueLabel={formatNumber(snapshot.vramUsedGb, 1)}
                  unit={unit}
                  ariaLabel="GPU VRAM usage"
                />
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-mute">
                    vram pressure
                  </div>
                  <div className="readout mt-1 text-[12.5px] text-ink">
                    {formatNumber(snapshot.vramUsedGb, 1)} / {formatGigabytes(snapshot.vramTotalGb, unit)}
                  </div>
                  <div className="mt-1 text-[10.5px] text-ink-mute">
                    {formatGigabytes(snapshot.vramTotalGb - snapshot.vramUsedGb, unit)} free
                  </div>
                  <div className="mt-3">
                    <Sparkline values={vramTrend} width={122} height={26} tone="accent" />
                  </div>
                </div>
              </div>

              <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-2">
                <StatTile
                  label="Utilization"
                  value={formatPercent(snapshot.gpuUtilization)}
                  detail="SM busy time"
                />
                <StatTile
                  label="Temperature"
                  value={
                    <span className="flex items-baseline gap-1">
                      {snapshot.gpuTemperatureC}
                      <span className="text-[10px] text-ink-mute">°C</span>
                    </span>
                  }
                  detail="Die sensor"
                  badge={<Thermometer className="h-3 w-3 text-ink-mute/60" />}
                />
                <StatTile
                  label="Memory type"
                  value={<span className="text-[12px]">GDDR class</span>}
                  detail="Placeholder"
                />
                <StatTile
                  label="Sampling"
                  value={<span className="text-[12px]">{mode === 'live' ? '4.2 s' : 'paused'}</span>}
                  detail={`last ${formatTime(snapshot.capturedAt)}`}
                />
              </div>
            </div>

            <div className="mt-4 border-t border-line/40 pt-3">
              <div className="mb-1.5 flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-mute">
                <span>vram allocation</span>
                <span>{formatPercent(vramPct, 1)}</span>
              </div>
              <ProgressBar value={vramPct} height="sm" tone={vramPct > 85 ? 'danger' : 'accent'} />
              <div className="mt-2 flex justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-ink-mute/60">
                <span>0</span>
                <span>{formatGigabytes(snapshot.vramTotalGb, unit)}</span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* --------------------------- memory + disk -------------------------- */}
        <div className="space-y-3 xl:col-span-5">
          <Card>
            <CardHeader
              kicker="system memory"
              title="Host RAM"
              action={<Badge tone="muted" mono>simulated</Badge>}
            />
            <CardBody>
              <div className="flex items-end justify-between">
                <div>
                  <div className="readout text-[22px] font-medium leading-none text-ink">
                    {formatNumber(snapshot.ramUsedGb, 1)}
                    <span className="ml-1 text-[10.5px] text-ink-mute">{unit} used</span>
                  </div>
                  <div className="mt-1.5 text-[11px] text-ink-mute">
                    {formatGigabytes(snapshot.ramTotalGb - snapshot.ramUsedGb, unit)} available of{' '}
                    {formatGigabytes(snapshot.ramTotalGb, unit)}
                  </div>
                </div>
                <MemoryStick className="h-4 w-4 text-ink-mute/60" />
              </div>
              <ProgressBar value={ramPct} height="sm" tone="glacier" className="mt-3" />
              <div className="mt-2 flex justify-between font-mono text-[9.5px] text-ink-mute/70">
                <span>{formatPercent(ramPct, 1)} engaged</span>
                <span>page cache excluded</span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              kicker="storage"
              title="Workspace volume"
              action={<HardDrive className="h-3.5 w-3.5 text-ink-mute/60" />}
            />
            <CardBody>
              <div className="flex items-end justify-between">
                <div className="readout text-[22px] font-medium leading-none text-ink">
                  {formatNumber(diskFree, 0)}
                  <span className="ml-1 text-[10.5px] text-ink-mute">{unit} free</span>
                </div>
                <Badge tone="muted" mono>
                  sim volume
                </Badge>
              </div>
              <ProgressBar
                value={diskPct}
                height="sm"
                tone={diskPct > 90 ? 'danger' : 'ok'}
                className="mt-3"
              />
              <div className="mt-2 flex justify-between font-mono text-[9.5px] text-ink-mute/70">
                <span>{formatGigabytes(snapshot.diskUsedGb, unit)} used</span>
                <span>{formatGigabytes(snapshot.diskTotalGb, unit)} total</span>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* ------------------------------- CPU ------------------------------- */}
        <Card className="xl:col-span-7">
          <CardHeader
            kicker="processor"
            title={snapshot.cpuName}
            hint="Core topology is a placeholder: 16 logical cores."
            action={<Badge tone="warn" dot>simulated</Badge>}
          />
          <CardBody>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="readout text-[22px] font-medium leading-none text-ink">
                  {formatPercent(snapshot.cpuUtilization)}
                  <span className="ml-2 text-[10.5px] font-normal text-ink-mute">
                    aggregate load
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-ink-mute">
                  <Cpu className="h-3 w-3" />
                  {snapshot.cpuCores} logical cores ·{' '}
                  <InfoHint
                    label="topology"
                    content="Per-core values are generated independently and do not correspond to a real processor topology. A native bridge will enumerate physical cores and SMT siblings."
                  />
                </div>
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute/60">
                sample {formatTime(snapshot.capturedAt)}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-8 gap-1.5">
              {snapshot.coreLoad.map((load, index) => (
                <div key={index} className="group relative">
                  <div
                    title={`Core ${index} · ${load}%`}
                    className="relative h-7 overflow-hidden rounded-[3px] border border-line/60 bg-surface2 transition-colors hover:border-accent/40"
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-accent/45 to-accent/80 transition-[height] duration-500"
                      style={{ height: `${Math.max(6, load)}%` }}
                    />
                  </div>
                  <span className="mt-1 block text-center font-mono text-[8px] text-ink-mute/60">
                    {String(index).padStart(2, '0')}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-line/40 pt-2.5">
              <div className="flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-mute/70">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-[1px] bg-accent/80" /> active
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-[1px] bg-surface2" /> idle
                </span>
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-mute/60">
                offload target surface
              </span>
            </div>
          </CardBody>
        </Card>

        {/* -------------------------- bridge contract ------------------------ */}
        <Card className="xl:col-span-5">
          <CardHeader
            kicker="native integration"
            title="Telemetry bridge"
            hint="Contract prepared for the desktop build."
            action={<Badge tone="neutral" dot>not attached</Badge>}
          />
          <CardBody className="space-y-2.5">
            {[
              {
                icon: <Plug className="h-3.5 w-3.5" />,
                name: 'Tauri command',
                spec: 'invoke("read_telemetry")',
                status: 'ready to wire',
              },
              {
                icon: <Activity className="h-3.5 w-3.5" />,
                name: 'Python sidecar',
                spec: 'GET 127.0.0.1/api/hardware',
                status: 'not configured',
              },
              {
                icon: <Cpu className="h-3.5 w-3.5" />,
                name: 'NVML / CUDA counters',
                spec: 'engine process only',
                status: 'engine missing',
              },
            ].map((row) => (
              <div
                key={row.name}
                className="flex items-center gap-3 rounded-md border border-line/60 bg-raised/40 px-3 py-2.5"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-line/70 bg-surface2/60 text-ink-mute">
                  {row.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11.5px] text-ink-dim">{row.name}</div>
                  <div className="truncate font-mono text-[9.5px] text-ink-mute/80">{row.spec}</div>
                </div>
                <span className="shrink-0 font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-mute/70">
                  {row.status}
                </span>
              </div>
            ))}

            <p className="text-[10.5px] leading-relaxed text-ink-mute">
              {TELEMETRY_BRIDGE.reason}
            </p>

            <Button
              variant="outline"
              className="w-full"
              icon={<ChevronRight />}
              iconRight={<span />}
              onClick={testBridge}
            >
              Test bridge connection
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
