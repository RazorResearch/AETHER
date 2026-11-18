import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Maximize2, Minimize2, PanelRightClose } from 'lucide-react';
import { ProvenanceBadge } from '@/components/ui/Badge';
import { axisTickStyle, tooltipStyle } from '@/components/charts/chartStyle';
import { useChartTheme } from '@/hooks/useTelemetry';
import { useAppStore } from '@/store/useAppStore';
import { useChatStore, type LivePoint } from '@/store/useChatStore';
import { useEngineStore } from '@/store/useEngineStore';
import { cn } from '@/utils/cn';
import { formatNumber } from '@/utils/format';
import { bytes, celsius, ms, num, pct, secs, tps, UNAVAILABLE, watts } from './fmt';

function Row({ label, value, source }: { label: string; value: string; source?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[3px]">
      <span className="text-[12.5px] text-ink-mute">{label}</span>
      <span className={cn('readout text-right text-[13px]', value === UNAVAILABLE ? 'text-ink-mute/60' : 'text-ink')} title={source}>
        {value}
      </span>
    </div>
  );
}

function Group({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-t border-line/50 pt-2">
      <div className="mb-1 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.12em] text-ink-mute">
        {title} {badge}
      </div>
      {children}
    </div>
  );
}

function Chart({ data, lines, unit, height = 120 }: { data: LivePoint[]; lines: { key: keyof LivePoint; name: string; color: string; scale?: number }[]; unit: string; height?: number }) {
  const theme = useChartTheme();
  const rows = data.map((p) => {
    const o: Record<string, number | null> = { t: p.t };
    for (const l of lines) {
      const v = p[l.key] as number | null;
      o[l.key as string] = v == null ? null : v / (l.scale ?? 1);
    }
    return o;
  });
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tick={axisTickStyle(theme)} tickFormatter={(v: number) => `${v.toFixed(1)}s`} stroke={theme.grid} />
          <YAxis tick={axisTickStyle(theme)} stroke={theme.grid} width={46} />
          <Tooltip {...tooltipStyle(theme)} labelFormatter={(v: number) => `t = ${Number(v).toFixed(2)} s`} formatter={(v: number, n: string) => [`${formatNumber(v, 2)} ${unit}`, n]} />
          {lines.map((l) => (
            <Line key={l.key as string} dataKey={l.key as string} name={l.name} stroke={l.color} dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MetricsPanel() {
  const panel = useChatStore((s) => s.panel);
  const set = useChatStore((s) => s.set);
  const phase = useChatStore((s) => s.phase);
  const live = useChatStore((s) => s.live);
  const points = useChatStore((s) => s.points);
  const last = useChatStore((s) => s.lastMetrics);
  const status = useChatStore((s) => s.runtimeStatus);
  const hw = useEngineStore((s) => s.hardware);
  const unit = useAppStore((s) => s.settings.unit);
  const theme = useChartTheme();
  const expanded = panel === 'expanded';
  const running = phase !== 'idle';
  const GiB = unit === 'GB' ? 1e9 : 1024 ** 3;

  // hardware: live SSE sample while generating, else the global engine snapshot
  const sample = running ? live?.sample : undefined;
  const gpu = hw?.gpus[0];
  const H = {
    gpuUtil: sample?.gpu_util ?? (running ? null : gpu?.utilization_gpu_percent ?? null),
    vram: sample?.vram_used ?? (running ? null : gpu?.vram_used_bytes ?? null),
    temp: sample?.gpu_temp ?? (running ? null : gpu?.temperature_c ?? null),
    power: sample?.gpu_power_w ?? (running ? null : gpu?.power_draw_w ?? null),
    cpu: sample?.cpu_util ?? (running ? null : hw?.cpu.utilization_percent ?? null),
    ram: sample?.ram_used ?? (running ? null : hw?.memory.used_bytes ?? null),
    rss: sample?.proc_rss ?? null,
  };
  const placement = status?.placement;
  const m = !running ? last : null;
  const statusLabel = { idle: m ? `last answer · ${m.finish_reason ?? 'done'}` : 'idle', loading: 'loading model', generating: 'generating', stopping: 'stopping' }[phase];

  return (
    <aside className="flex h-full flex-col border-l border-line/60 bg-raised" aria-label="Inference metrics">
      <div className="flex items-center justify-between border-b border-line/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-medium text-ink">Live metrics</span>
          <ProvenanceBadge kind={running ? 'live' : 'measured'} />
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" className="rounded-sm p-1 text-ink-mute hover:text-ink" aria-label={expanded ? 'Compact view' : 'Expanded view'}
            onClick={() => set({ panel: expanded ? 'compact' : 'expanded' })}>
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button type="button" className="rounded-sm p-1 text-ink-mute hover:text-ink" aria-label="Hide metrics" onClick={() => set({ panel: 'hidden' })}>
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
        <div className="flex items-center gap-2 text-[12.5px]">
          <span className={cn('h-1.5 w-1.5 rounded-full', running ? 'animate-pulse bg-accent' : 'bg-ink-mute/50')} />
          <span className="text-ink-dim">{statusLabel}</span>
        </div>

        <Group title="Generation" badge={<span className="normal-case tracking-normal">{running ? 'streaming' : m ? 'final' : ''}</span>}>
          {running ? (
            <>
              <Row label="Speed (last 1 s)" value={tps(live?.live_tokens_per_s)} source="wall clock, AETHER" />
              <Row label="Speed (average)" value={tps(live?.avg_tokens_per_s)} />
              <Row label="Generated tokens" value={num(live?.streamed_tokens)} source="streamed chunks" />
              <Row label="Time to first token" value={ms(live?.ttft_ms)} />
              <Row label="Elapsed" value={ms(live?.elapsed_ms)} />
              <Row label="Prompt tokens" value={UNAVAILABLE} source="reported at completion" />
            </>
          ) : m ? (
            <>
              <Row label="Speed (llama.cpp)" value={tps(m.engine.tokens_per_s)} source="llama-server timings" />
              <Row label="Speed (wall)" value={tps(m.wall.tokens_per_s)} source="AETHER, includes streaming overhead" />
              <Row label="Generated tokens" value={num(m.engine.completion_tokens)} />
              <Row label="Time to first token" value={ms(m.wall.ttft_ms, 1)} source="wall clock, request → first token" />
              <Row label="Time per output token" value={ms(m.engine.tpot_ms ?? m.wall.tpot_ms, 2)} />
              <Row label="Prompt tokens" value={num(m.engine.prompt_tokens)} />
              <Row label="Prefill speed" value={tps(m.engine.prompt_tokens_per_s, 0)} source="llama-server timings" />
              <Row label="Total duration" value={ms(m.wall.total_ms)} />
              <Row label="Energy / token (GPU only)" value={m.energy_per_token_j == null ? UNAVAILABLE : `${formatNumber(m.energy_per_token_j, 3)} J`} />
            </>
          ) : (
            <p className="py-1 text-[12.5px] text-ink-mute">Send a message to measure a generation.</p>
          )}
        </Group>

        <Group title="Hardware" badge={<span className="normal-case tracking-normal">{running ? 'sampled every 250 ms' : 'engine snapshot'}</span>}>
          <Row label="GPU utilization" value={pct(H.gpuUtil)} />
          <Row label="VRAM (device)" value={bytes(H.vram, unit)} />
          <Row label="GPU temperature" value={celsius(H.temp)} />
          <Row label="GPU power" value={watts(H.power)} />
          <Row label="CPU utilization" value={pct(H.cpu)} />
          <Row label="System RAM used" value={bytes(H.ram, unit)} />
          <Row label="llama-server RSS" value={bytes(H.rss ?? (m?.hardware?.peak_proc_rss_bytes ?? null), unit)} source={H.rss == null && m ? 'peak during last answer' : undefined} />
          <Row
            label="GPU / CPU layers"
            value={placement?.layers_on_gpu != null ? `${placement.layers_on_gpu} / ${(placement.layers_total ?? 0) - placement.layers_on_gpu} of ${placement.layers_total}` : UNAVAILABLE}
            source="llama.cpp load log"
          />
          {m?.hardware && (
            <>
              <Row label="Peak VRAM (last answer)" value={bytes(m.hardware.peak_vram_bytes, unit)} />
              <Row label="Mean GPU util (last answer)" value={pct(m.hardware.mean_gpu_util)} />
              <Row label="GPU energy (last answer)" value={m.hardware.gpu_energy_j == null ? UNAVAILABLE : `${formatNumber(m.hardware.gpu_energy_j, 2)} J`} />
            </>
          )}
        </Group>

        {expanded && (
          <>
            <Group title="Generation speed" badge={<span className="normal-case tracking-normal">tok/s vs time</span>}>
              {points.length > 1 ? (
                <Chart data={points} unit="tok/s" lines={[{ key: 'tps', name: 'tokens/s', color: theme.accent }]} />
              ) : (
                <p className="py-2 text-[12px] text-ink-mute">Plotted from live samples during generation.</p>
              )}
            </Group>
            <Group title="Memory" badge={<span className="normal-case tracking-normal">{unit === 'GB' ? 'GB' : 'GiB'}</span>}>
              {points.length > 1 ? (
                <Chart data={points} unit={unit === 'GB' ? 'GB' : 'GiB'} lines={[
                  { key: 'vram', name: 'VRAM (device)', color: theme.accent, scale: GiB },
                  { key: 'ram', name: 'RAM (system)', color: theme.glacier, scale: GiB },
                  { key: 'rss', name: 'llama-server RSS', color: theme.warn, scale: GiB },
                ]} />
              ) : (
                <p className="py-2 text-[12px] text-ink-mute">Plotted from live samples during generation.</p>
              )}
            </Group>
            <Group title="Utilization" badge={<span className="normal-case tracking-normal">%</span>}>
              {points.length > 1 ? (
                <Chart data={points} unit="%" lines={[
                  { key: 'gpu', name: 'GPU', color: theme.ok },
                  { key: 'cpu', name: 'CPU', color: theme.warn },
                ]} />
              ) : (
                <p className="py-2 text-[12px] text-ink-mute">Plotted from live samples during generation.</p>
              )}
            </Group>
            {m && <Timeline m={m} />}
          </>
        )}
      </div>
      <div className="border-t border-line/50 px-3 py-1.5 font-mono text-[10.5px] leading-snug text-ink-mute/70">
        Hover a value for its source. Energy = NVML GPU board counter (GPU only).
      </div>
    </aside>
  );
}

function Timeline({ m }: { m: NonNullable<ReturnType<typeof useChatStore.getState>['lastMetrics']> }) {
  const load = (m.load?.load_time_s ?? 0) * 1000;
  const ttft = m.wall.ttft_ms ?? 0;
  const total = m.wall.total_ms ?? 0;
  const decode = Math.max(0, total - ttft);
  const all = load + total || 1;
  const seg = [
    { label: 'model load', v: load, cls: 'bg-ink-mute/50' },
    { label: 'prefill + first token', v: ttft, cls: 'bg-warn/80' },
    { label: 'decode', v: decode, cls: 'bg-accent' },
  ].filter((s) => s.v > 0);
  return (
    <Group title="Generation timeline" badge={<span className="normal-case tracking-normal">{secs((load + total) / 1000)}</span>}>
      <div className="flex h-2.5 overflow-hidden rounded-sm bg-surface2">
        {seg.map((s) => (
          <div key={s.label} className={s.cls} style={{ width: `${(s.v / all) * 100}%` }} title={`${s.label}: ${formatNumber(s.v, 0)} ms`} />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[11px] text-ink-mute">
        {seg.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1">
            <span className={cn('h-1.5 w-1.5 rounded-[1px]', s.cls)} /> {s.label} {formatNumber(s.v, 0)} ms
          </span>
        ))}
      </div>
    </Group>
  );
}
