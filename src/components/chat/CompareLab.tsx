import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ErrorBar, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, FlaskConical, Play, Plus, Trash2, Trophy } from 'lucide-react';
import { Badge, ProvenanceBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { axisTickStyle, tooltipStyle } from '@/components/charts/chartStyle';
import { useChartTheme } from '@/hooks/useTelemetry';
import { chatApi, DEFAULT_RUNTIME, type Comparison, type CompareResult, type RuntimeConfig } from '@/api/chat';
import { errorMessage } from '@/api/client';
import { useAppStore } from '@/store/useAppStore';
import { useChatStore } from '@/store/useChatStore';
import { toast } from '@/store/useToastStore';
import { cn } from '@/utils/cn';
import { formatBytes, formatDateTime, formatNumber } from '@/utils/format';
import { validateConfig } from './SettingsPanel';

interface Cfg {
  label: string;
  model_id: string;
  runtime: RuntimeConfig;
}

const LETTERS = ['A', 'B', 'C', 'D'];

export function CompareLab() {
  const models = useChatStore((s) => s.models).filter((m) => m.loadable);
  const backend = useChatStore((s) => s.backend);
  const current = { modelId: useChatStore((s) => s.modelId), runtime: useChatStore((s) => s.runtime) };
  const phase = useChatStore((s) => s.phase);
  const [prompt, setPrompt] = useState('Explain, in about 150 words, how a transformer decodes text token by token.');
  const [maxTokens, setMaxTokens] = useState(256);
  const [temperature, setTemperature] = useState(0);
  const [seed, setSeed] = useState(42);
  const [warmup, setWarmup] = useState(1);
  const [reps, setReps] = useState(3);
  const first = current.modelId ?? models[0]?.id ?? '';
  const [cfgs, setCfgs] = useState<Cfg[]>([
    { label: 'A', model_id: first, runtime: { ...current.runtime } },
    { label: 'B', model_id: first, runtime: { ...current.runtime, cache_type_k: 'q8_0', cache_type_v: 'q8_0', flash_attn: 'on' } },
  ]);
  const [confirm, setConfirm] = useState(false);
  const [history, setHistory] = useState<Comparison[]>([]);
  const [selected, setSelected] = useState<Comparison | null>(null);

  const refresh = async () => {
    try {
      const list = await chatApi.comparisons();
      setHistory(list);
      if (selected) setSelected(list.find((c) => c.id === selected.id) ?? selected);
      else if (list[0]) setSelected(list[0]);
    } catch {
      /* offline */
    }
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = selected && (selected.status === 'queued' || selected.status === 'running');
  useEffect(() => {
    if (!running || !selected) return;
    const id = window.setInterval(async () => {
      try {
        const c = await chatApi.comparison(selected.id);
        setSelected(c);
        if (c.status !== 'queued' && c.status !== 'running') void refresh();
      } catch {
        /* retry */
      }
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, selected?.id]);

  const errors = cfgs.map((c) => {
    const m = models.find((x) => x.id === c.model_id);
    return validateConfig(c.runtime, m?.context_length ?? null, m?.n_layers ?? null, backend?.max_threads ?? null, backend?.kv_cache_types ?? ['f16', 'q8_0', 'q4_0']);
  });
  const invalid = errors.some((e) => Object.keys(e).length > 0) || cfgs.some((c) => !c.model_id) || !prompt.trim();

  const start = async () => {
    try {
      const c = await chatApi.compare({
        prompt,
        generation: { temperature, seed, max_tokens: maxTokens, top_p: 0.95, top_k: 40, min_p: 0.05, repeat_penalty: 1.1 },
        configs: cfgs,
        warmup_runs: warmup,
        repetitions: reps,
        confirm: true,
      });
      setConfirm(false);
      setSelected(c);
      void refresh();
      toast.info('Comparison started', 'Configurations are loaded and measured one after another.');
    } catch (e) {
      toast.error('Could not start comparison', errorMessage(e));
    }
  };

  const upd = (i: number, p: Partial<Cfg> | Partial<RuntimeConfig>, runtime = false) =>
    setCfgs((xs) => xs.map((c, j) => (j !== i ? c : runtime ? { ...c, runtime: { ...c.runtime, ...(p as Partial<RuntimeConfig>) } } : { ...c, ...(p as Partial<Cfg>) })));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1300px] space-y-3 px-4 py-4">
        <Card>
          <CardHeader
            title="Compare Configurations"
            hint="Same prompt, same sampling and seed, warm-up then repeated measured runs per configuration. Results are medians with p25–p75."
            action={<FlaskConical className="h-4 w-4 text-ink-mute" />}
          />
          <CardBody className="space-y-3">
            <TextArea label="Prompt" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              <TextInput label="Max tokens" type="number" value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value) || 1)} />
              <TextInput label="Temperature" type="number" step={0.1} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} hint="0 = greedy" />
              <TextInput label="Seed" type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
              <TextInput label="Warm-up runs" type="number" min={0} max={5} value={warmup} onChange={(e) => setWarmup(Number(e.target.value))} />
              <TextInput label="Measured runs" type="number" min={1} max={20} value={reps} onChange={(e) => setReps(Number(e.target.value))} />
            </div>

            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {cfgs.map((c, i) => (
                <div key={i} className="rounded-md border border-line/70 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <TextInput value={c.label} onChange={(e) => upd(i, { label: e.target.value })} wrapperClassName="w-24" aria-label="Configuration label" />
                    <SelectInput value={c.model_id} onChange={(e) => upd(i, { model_id: e.target.value })} wrapperClassName="flex-1" aria-label="Model">
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} — {m.quantization ?? ''}
                        </option>
                      ))}
                    </SelectInput>
                    {cfgs.length > 2 && (
                      <Button variant="ghost" size="icon" aria-label="Remove configuration" onClick={() => setCfgs((xs) => xs.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <TextInput label="Context" type="number" value={c.runtime.n_ctx} onChange={(e) => upd(i, { n_ctx: Number(e.target.value) }, true)} />
                    <TextInput label="GPU layers" type="number" value={c.runtime.n_gpu_layers} onChange={(e) => upd(i, { n_gpu_layers: Number(e.target.value) }, true)} />
                    <SelectInput label="Flash attn" value={c.runtime.flash_attn} onChange={(e) => upd(i, { flash_attn: e.target.value as RuntimeConfig['flash_attn'] }, true)}>
                      {['auto', 'on', 'off'].map((x) => <option key={x}>{x}</option>)}
                    </SelectInput>
                    <SelectInput label="KV K" value={c.runtime.cache_type_k} onChange={(e) => upd(i, { cache_type_k: e.target.value }, true)}>
                      {(backend?.kv_cache_types ?? ['f16']).map((x) => <option key={x}>{x}</option>)}
                    </SelectInput>
                    <SelectInput label="KV V" value={c.runtime.cache_type_v} onChange={(e) => upd(i, { cache_type_v: e.target.value }, true)}>
                      {(backend?.kv_cache_types ?? ['f16']).map((x) => <option key={x}>{x}</option>)}
                    </SelectInput>
                    <TextInput label="Batch / µbatch" value={`${c.runtime.n_batch}/${c.runtime.n_ubatch}`}
                      onChange={(e) => {
                        const [b, u] = e.target.value.split('/').map(Number);
                        upd(i, { n_batch: b || 2048, n_ubatch: u || 512 }, true);
                      }} />
                  </div>
                  {Object.values(errors[i]).map((err) => (
                    <p key={err} className="mt-1 text-[12px] text-danger">{err}</p>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {cfgs.length < 4 && (
                <Button variant="outline" icon={<Plus />} onClick={() => setCfgs((xs) => [...xs, { label: LETTERS[xs.length], model_id: first, runtime: { ...DEFAULT_RUNTIME } }])}>
                  Add configuration
                </Button>
              )}
              <span className="ml-auto text-[12.5px] text-ink-mute">
                {cfgs.length} configs × ({warmup} warm-up + {reps} runs) = {cfgs.length * (warmup + reps)} generations
              </span>
              <Button variant="primary" icon={<Play />} disabled={invalid || Boolean(running) || phase !== 'idle'} onClick={() => setConfirm(true)}>
                Run comparison
              </Button>
            </div>
          </CardBody>
        </Card>

        {selected && <ComparisonView c={selected} />}

        {history.length > 0 && (
          <Card>
            <CardHeader title="Previous comparisons" hint="Stored by the engine (SQLite)." />
            <ul className="divide-y divide-line/40">
              {history.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => setSelected(h)}
                    className={cn('flex w-full items-center gap-3 px-5 py-2 text-left hover:bg-surface2/30', selected?.id === h.id && 'bg-surface2/40')}>
                    <span className="font-mono text-[12px] text-ink-mute">{formatDateTime(h.created_at)}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-dim">{h.request.configs.map((c) => c.label).join(' vs ')} · {h.request.prompt}</span>
                    <Badge tone={h.status === 'completed' ? 'ok' : h.status === 'failed' ? 'danger' : 'warn'} dot>{h.status}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Run the comparison?"
        kicker="confirmation required"
        description={`${cfgs.length * (warmup + reps)} generations will run on the GPU, reloading the model for each configuration. The chat model is unloaded during the comparison.`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="primary" icon={<Play />} onClick={() => void start()}>Run</Button>
          </>
        }
      >
        <p className="text-[13.5px] text-ink-dim">Close other GPU workloads for comparable measurements.</p>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function fmtMetric(v: number | null | undefined, unit: string, u: 'GB' | 'GiB') {
  if (v == null) return 'Unavailable';
  if (unit === 'bytes') return formatBytes(v, u);
  const d = unit === 'J/tok' ? 3 : unit === 'ms' ? 1 : 1;
  return `${formatNumber(v, d)} ${unit}`;
}

function ComparisonView({ c }: { c: Comparison }) {
  const unit = useAppStore((s) => s.settings.unit);
  const r: CompareResult | null = c.results;
  if (c.status === 'queued' || c.status === 'running') {
    return (
      <Card>
        <CardBody>
          <div className="mb-1 flex justify-between text-[13px] text-ink-dim">
            <span>{c.job?.stage ?? 'queued'}</span>
            <span className="readout">{formatNumber((c.job?.progress ?? 0) * 100, 0)} %</span>
          </div>
          <ProgressBar value={(c.job?.progress ?? 0) * 100} height="sm" />
        </CardBody>
      </Card>
    );
  }
  if (!r) {
    return (
      <Card>
        <CardBody>
          <p className="flex items-center gap-2 text-[13px] text-danger">
            <AlertTriangle className="h-3.5 w-3.5" /> {c.job?.error ? `${c.job.error.code}: ${c.job.error.message}` : `Comparison ${c.status}.`}
          </p>
        </CardBody>
      </Card>
    );
  }
  const labels = r.configs.map((x) => x.label);
  return (
    <Card>
      <CardHeader
        title={`Results · ${labels.join(' vs ')}`}
        hint={`${formatDateTime(r.measured_at)} · ${r.hardware.gpu ?? 'CPU'} · llama.cpp ${r.backend ?? ''} · ${r.protocol.warmup_runs} warm-up + ${r.protocol.repetitions} runs · ${r.protocol.statistic}`}
        action={<ProvenanceBadge kind="measured" />}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-ink-mute/70">
            <tr className="border-b border-line/70">
              <th className="py-2 pl-5 pr-3">Metric</th>
              {r.configs.map((x) => (
                <th key={x.label} className="px-3 py-2">
                  {x.label}
                  <div className="font-sans text-[11px] normal-case tracking-normal text-ink-mute">
                    {x.model.quantization} · ngl {x.runtime.n_gpu_layers} · ctx {x.runtime.n_ctx} · KV {x.runtime.cache_type_k}/{x.runtime.cache_type_v}
                  </div>
                </th>
              ))}
              <th className="px-3 py-2">Best</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(r.metrics).map(([key, meta]) => {
              const cmp = r.comparison[key];
              return (
                <tr key={key} className="border-b border-line/30">
                  <td className="py-2 pl-5 pr-3 text-ink-dim">
                    {meta.label}
                    <div className="font-mono text-[11px] text-ink-mute">{meta.direction === 'max' ? 'higher is better' : 'lower is better'}</div>
                  </td>
                  {r.configs.map((x) => {
                    const a = x.stats[key];
                    const d = cmp?.vs_reference[x.label];
                    return (
                      <td key={x.label} className={cn('px-3 py-2 font-mono', cmp?.best === x.label && 'text-ok')}>
                        {fmtMetric(a?.median, meta.unit, unit)}
                        {a && <div className="text-[11px] text-ink-mute">p25–p75 {fmtMetric(a.p25, meta.unit, unit)} – {fmtMetric(a.p75, meta.unit, unit)} · n={a.n}</div>}
                        {d && d.percent != null && (
                          <div className={cn('text-[11px]', (meta.direction === 'max' ? d.percent > 0 : d.percent < 0) ? 'text-ok' : 'text-danger')}>
                            {d.percent > 0 ? '+' : ''}{formatNumber(d.percent, 1)} % vs {cmp.reference} ({d.absolute > 0 ? '+' : ''}{fmtMetric(d.absolute, meta.unit, unit)})
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2">{cmp?.best ? <span className="inline-flex items-center gap-1 text-ok"><Trophy className="h-3 w-3" />{cmp.best}</span> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <CardBody className="space-y-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <MetricChart r={r} metric="gen_tokens_per_s" />
          <MetricChart r={r} metric="ttft_ms" />
          <MetricChart r={r} metric="peak_vram_over_baseline_bytes" scale={1024 ** 2} unitOverride="MiB" />
        </div>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {r.configs.map((x) => (
            <div key={x.label} className="rounded-md border border-line/60 p-2.5">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-dim">
                <span className="font-medium text-ink">{x.label}</span>
                <span className="font-mono text-[11.5px] text-ink-mute">
                  load {x.load_time_s ?? '?'} s · {x.placement.layers_on_gpu ?? '?'}/{x.placement.layers_total ?? '?'} layers on GPU · resident VRAM {x.vram_resident_bytes != null ? formatBytes(x.vram_resident_bytes, unit) : 'Unavailable'}
                </span>
                <Badge tone={x.deterministic_output ? 'ok' : 'warn'}>{x.deterministic_output ? 'identical output across runs' : 'output varied across runs'}</Badge>
              </div>
              <div className="max-h-[140px] overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-mute">{x.output_sample}</div>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2 border-l-2 border-warn/60 pl-3 text-[12.5px] text-ink-dim">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warn" />
          <div>
            <div>Quality: {r.quality.note}</div>
            <ul className="mt-1 list-disc pl-4 text-ink-mute">
              {r.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function MetricChart({ r, metric, scale = 1, unitOverride }: { r: CompareResult; metric: string; scale?: number; unitOverride?: string }) {
  const theme = useChartTheme();
  const meta = r.metrics[metric];
  const data = useMemo(
    () =>
      r.configs.map((x) => {
        const a = x.stats[metric];
        return a
          ? { label: x.label, median: a.median / scale, err: [(a.median - a.p25) / scale, (a.p75 - a.median) / scale] }
          : { label: x.label, median: null, err: [0, 0] };
      }),
    [r, metric, scale],
  );
  return (
    <div className="rounded-md border border-line/60 p-2">
      <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-mute">
        {meta.label} ({unitOverride ?? meta.unit}) · median, p25–p75
      </div>
      <div style={{ height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 6, left: -12, bottom: 0 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis dataKey="label" tick={axisTickStyle(theme)} stroke={theme.grid} />
            <YAxis tick={axisTickStyle(theme)} stroke={theme.grid} />
            <Tooltip {...tooltipStyle(theme)} formatter={(v: number) => formatNumber(v, 2)} />
            <Bar dataKey="median" fill={theme.accent} barSize={28} isAnimationActive={false}>
              <ErrorBar dataKey="err" stroke={theme.axis} width={6} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
