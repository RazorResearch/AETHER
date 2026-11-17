import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Download, Play, Scale } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, ProvenanceBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectInput, TextInput, Toggle } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ComparisonChart } from '@/components/charts/ComparisonChart';
import { MetricComparisonTable } from '@/components/tables/MetricComparisonTable';
import { EngineOffline } from '@/components/engine/EngineOffline';
import { api, errorMessage } from '@/api/client';
import type { Benchmark, BenchmarkRecord } from '@/api/types';
import { jobStatusLabel, jobStatusTone, modelLabel } from '@/api/adapters';
import { useAppStore } from '@/store/useAppStore';
import { useCapability, useEngineStore } from '@/store/useEngineStore';
import { toast } from '@/store/useToastStore';
import type { BenchmarkMetric } from '@/types';
import { formatBytes, formatDateTime, formatNumber } from '@/utils/format';

const KV_TYPES = ['f16', 'q8_0', 'q5_1', 'q5_0', 'q4_1', 'q4_0'];
const GiB = 1024 ** 3;

const describeRun = (b: Benchmark) => {
  const rt = b.spec.params?.runtime ?? {};
  return `ngl ${rt.n_gpu_layers ?? 99} · KV ${rt.cache_type_k ?? 'f16'}/${rt.cache_type_v ?? 'f16'}${rt.flash_attn ? ' · FA' : ''}`;
};

/** Benchmarks measured by the engine (llama-bench + optional llama-perplexity). */
export function BenchmarksPage() {
  const benchmarks = useEngineStore((s) => s.benchmarks);
  const models = useEngineStore((s) => s.models);
  const jobs = useEngineStore((s) => s.jobs);
  const connection = useEngineStore((s) => s.connection);
  const bench = useCapability('llama.cpp', 'bench');
  const unit = useAppStore((s) => s.settings.unit);
  const online = connection === 'online';

  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Benchmark | null>(null);
  const completed = useMemo(() => benchmarks.filter((b) => b.status === 'completed' && b.record), [benchmarks]);
  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');

  useEffect(() => {
    if (completed.length >= 2 && (!aId || !bId)) {
      setAId(completed[1].id);
      setBId(completed[0].id);
    }
  }, [completed, aId, bId]);

  const jobOf = (b: Benchmark) => jobs.find((j) => j.id === b.job_id);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Benchmarks"
        subtitle="Speed, memory, energy and perplexity measured on this machine. Every run keeps its full reproducibility record."
        meta={<ProvenanceBadge kind={online ? 'measured' : 'offline'} />}
        actions={
          <Button variant="primary" icon={<Play />} onClick={() => setCreateOpen(true)} disabled={!online || !bench.ok || models.length === 0}>
            New benchmark
          </Button>
        }
      />

      <EngineOffline compact />

      {online && !bench.ok && (
        <div className="mb-3 flex items-start gap-2.5 border-l-2 border-warn/60 pl-3">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warn/80" />
          <p className="text-[13.5px] leading-relaxed text-ink-dim">
            <span className="font-medium text-warn">Benchmarks unavailable.</span> {bench.reason} Build llama.cpp
            (CUDA) and start the engine with <span className="font-mono">AETHER_LLAMACPP_DIR</span> set. Nothing is
            simulated in the meantime.
          </p>
        </div>
      )}

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              Runs <span className="readout text-[13px] font-normal text-ink-mute">{benchmarks.length}</span>
            </span>
          }
          hint="Click a run for its full record (parameters, hardware fingerprint, engine version, samples)."
        />
        {benchmarks.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={<BarChart3 />}
              title="No benchmark measured yet"
              description="Results appear here only after llama-bench has actually run on this machine."
            />
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line/70">
                  {['Model', 'Runtime', 'Status', 'Gen tok/s', 'Prompt tok/s', 'TTFT*', 'Peak VRAM', 'Energy', 'PPL', 'Date'].map((h) => (
                    <th key={h} className="px-3 py-2 font-mono text-[11.5px] font-normal uppercase tracking-[0.08em] text-ink-mute/70 first:pl-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {benchmarks.map((b) => {
                  const r = b.record;
                  const job = jobOf(b);
                  const active = b.status === 'queued' || b.status === 'running';
                  return (
                    <tr key={b.id} onClick={() => setDetail(b)} className="cursor-pointer border-b border-line/30 font-mono text-[12.5px] text-ink-dim last:border-0 hover:bg-surface2/30">
                      <td className="max-w-[220px] py-2 pl-4 pr-3 font-sans text-[13.5px]">
                        <span className="block truncate">{r?.model.name ?? modelLabel(models, b.model_id)}</span>
                        {b.spec.label && <span className="font-mono text-[11.5px] text-ink-mute">{b.spec.label}</span>}
                      </td>
                      <td className="px-3 py-2 text-ink-mute">{describeRun(b)}</td>
                      <td className="min-w-[120px] px-3 py-2">
                        <Badge tone={jobStatusTone[b.status]} dot>
                          {jobStatusLabel[b.status]}
                        </Badge>
                        {active && job && <ProgressBar value={job.progress * 100} height="sm" className="mt-1" />}
                      </td>
                      <td className="px-3 py-2">{r?.gen_tps ? `${formatNumber(r.gen_tps.mean, 1)} ± ${formatNumber(r.gen_tps.std ?? 0, 1)}` : '—'}</td>
                      <td className="px-3 py-2">{r?.prompt_tps ? formatNumber(r.prompt_tps.mean, 0) : '—'}</td>
                      <td className="px-3 py-2">{r?.speed?.ttft_ms != null ? `${formatNumber(r.speed.ttft_ms, 0)} ms` : '—'}</td>
                      <td className="px-3 py-2">{r?.speed?.resources.peak_vram_bytes != null ? formatBytes(r.speed.resources.peak_vram_bytes, unit) : '—'}</td>
                      <td className="px-3 py-2">{r?.speed?.resources.energy_joules != null ? `${formatNumber(r.speed.resources.energy_joules, 0)} J` : '—'}</td>
                      <td className="px-3 py-2">{r?.quality.perplexity ? formatNumber(r.quality.perplexity.perplexity, 3) : '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-ink-mute">{formatDateTime(b.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="border-t border-line/40 px-5 py-2 text-[12.5px] text-ink-mute">
              * TTFT is derived (prompt time + one generated token), not a wall-clock measurement. Peak VRAM
              may be device-level; see each record's notes.
            </p>
          </div>
        )}
      </Card>

      <Comparison completed={completed} aId={aId} bId={bId} setAId={setAId} setBId={setBId} />

      {createOpen && <CreateBenchmarkDialog onClose={() => setCreateOpen(false)} />}
      {detail && <BenchmarkDetail benchmark={benchmarks.find((b) => b.id === detail.id) ?? detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function metricsFrom(a: BenchmarkRecord, b: BenchmarkRecord): BenchmarkMetric[] {
  const out: BenchmarkMetric[] = [];
  const push = (id: string, label: string, unit: string, betterWhen: 'higher' | 'lower', description: string, x?: number | null, y?: number | null) => {
    if (x != null && y != null && x !== 0) out.push({ id, label, unit, betterWhen, description, original: x, optimized: y });
  };
  push('tps', 'Generation', 'tok/s', 'higher', 'Mean llama-bench tg tokens/s.', a.gen_tps?.mean, b.gen_tps?.mean);
  push('pp', 'Prompt processing', 'tok/s', 'higher', 'Mean llama-bench pp tokens/s.', a.prompt_tps?.mean, b.prompt_tps?.mean);
  push('ttft', 'TTFT (derived)', 'ms', 'lower', 'Prompt time + 1 token, derived from throughput.', a.speed?.ttft_ms, b.speed?.ttft_ms);
  push('vram', 'Peak VRAM', 'GiB', 'lower', 'Peak GPU memory during the run.', bytesToGiB(a.speed?.resources.peak_vram_bytes), bytesToGiB(b.speed?.resources.peak_vram_bytes));
  push('ram', 'Peak RAM', 'GiB', 'lower', 'Peak RSS of the process tree.', bytesToGiB(a.speed?.resources.peak_ram_bytes), bytesToGiB(b.speed?.resources.peak_ram_bytes));
  push('energy', 'GPU energy', 'J', 'lower', 'NVML energy counter delta over the run.', a.speed?.resources.energy_joules, b.speed?.resources.energy_joules);
  push('ppl', 'Perplexity', 'PPL', 'lower', 'llama-perplexity final estimate.', a.quality.perplexity?.perplexity, b.quality.perplexity?.perplexity);
  return out;
}

const bytesToGiB = (v: number | null | undefined) => (v == null ? null : v / GiB);

function Comparison({
  completed,
  aId,
  bId,
  setAId,
  setBId,
}: {
  completed: Benchmark[];
  aId: string;
  bId: string;
  setAId: (v: string) => void;
  setBId: (v: string) => void;
}) {
  const [check, setCheck] = useState<{ comparable: boolean; issues: string[] } | null>(null);
  const a = completed.find((x) => x.id === aId)?.record;
  const b = completed.find((x) => x.id === bId)?.record;

  useEffect(() => {
    setCheck(null);
    if (!aId || !bId || aId === bId) return;
    let alive = true;
    api.compareBenchmarks(aId, bId).then((c) => alive && setCheck(c)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [aId, bId]);

  if (completed.length < 2) return null;
  const metrics = a && b ? metricsFrom(a, b) : [];
  const label = (x: Benchmark) => `${x.record?.model.name ?? x.model_id} · ${describeRun(x)} · ${formatDateTime(x.created_at)}`;

  return (
    <Card className="mt-3">
      <CardHeader title="Compare two runs" hint="Run A is the baseline. Bars: 100 = identical, longer = better." action={<Scale className="h-3.5 w-3.5 text-ink-mute/60" />} />
      <CardBody className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SelectInput label="Run A (baseline)" value={aId} onChange={(e) => setAId(e.target.value)}>
            {completed.map((x) => (
              <option key={x.id} value={x.id}>
                {label(x)}
              </option>
            ))}
          </SelectInput>
          <SelectInput label="Run B" value={bId} onChange={(e) => setBId(e.target.value)}>
            {completed.map((x) => (
              <option key={x.id} value={x.id}>
                {label(x)}
              </option>
            ))}
          </SelectInput>
        </div>
        {check && !check.comparable && (
          <div className="flex items-start gap-2 border-l-2 border-warn/60 pl-3 text-[13px] text-ink-dim">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warn" />
            <div>
              <span className="font-medium text-warn">Not directly comparable:</span>
              <ul className="mt-0.5 list-disc pl-4">
                {check.issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {aId === bId ? (
          <p className="text-[13px] text-ink-mute">Select two different runs.</p>
        ) : metrics.length > 0 ? (
          <>
            <ComparisonChart metrics={metrics} />
            <MetricComparisonTable metrics={metrics} />
          </>
        ) : (
          <p className="text-[13px] text-ink-mute">No metric measured on both runs.</p>
        )}
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function CreateBenchmarkDialog({ onClose }: { onClose: () => void }) {
  const models = useEngineStore((s) => s.models);
  const refreshCollections = useEngineStore((s) => s.refreshCollections);
  const ppl = useCapability('llama.cpp', 'perplexity');
  const available = models.filter((m) => m.status === 'available' && m.format === 'gguf');
  const [modelId, setModelId] = useState(available[0]?.id ?? '');
  const [nPrompt, setNPrompt] = useState('512');
  const [nGen, setNGen] = useState('128');
  const [reps, setReps] = useState('5');
  const [ngl, setNgl] = useState('99');
  const [ctk, setCtk] = useState('f16');
  const [ctv, setCtv] = useState('f16');
  const [fa, setFa] = useState(true);
  const [dataset, setDataset] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createBenchmark({
        model_id: modelId,
        label: label.trim() || null,
        params: {
          n_prompt: Number(nPrompt),
          n_gen: Number(nGen),
          repetitions: Number(reps),
          runtime: { n_gpu_layers: Number(ngl), cache_type_k: ctk, cache_type_v: ctv, flash_attn: fa },
        },
        perplexity_dataset: dataset.trim() || null,
      });
      toast.info('Benchmark queued', 'llama-bench runs in the background; results appear when measured.');
      await refreshCollections();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New benchmark"
      kicker="llama-bench"
      description="Runs on the GPU of the engine host. Close other GPU workloads for clean numbers."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Play />} onClick={() => void submit()} loading={busy} disabled={!modelId}>
            Run benchmark
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <SelectInput label="Model (GGUF)" value={modelId} onChange={(e) => setModelId(e.target.value)}>
          {available.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} — {m.quantization ?? ''}
            </option>
          ))}
        </SelectInput>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TextInput label="Prompt tokens" type="number" value={nPrompt} onChange={(e) => setNPrompt(e.target.value)} />
          <TextInput label="Generated tokens" type="number" value={nGen} onChange={(e) => setNGen(e.target.value)} />
          <TextInput label="Repetitions" type="number" value={reps} onChange={(e) => setReps(e.target.value)} />
          <TextInput label="GPU layers" type="number" value={ngl} onChange={(e) => setNgl(e.target.value)} />
          <SelectInput label="KV cache K" value={ctk} onChange={(e) => setCtk(e.target.value)}>
            {KV_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </SelectInput>
          <SelectInput label="KV cache V" value={ctv} onChange={(e) => setCtv(e.target.value)}>
            {KV_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </SelectInput>
          <div className="col-span-2 flex items-end pb-1">
            <Toggle checked={fa} onChange={setFa} label="Flash attention" description="required for a quantized V cache" />
          </div>
        </div>
        <TextInput
          label="Perplexity dataset"
          hint={ppl.ok ? 'absolute path to a local .txt (optional)' : 'llama-perplexity not available'}
          value={dataset}
          onChange={(e) => setDataset(e.target.value)}
          disabled={!ppl.ok}
        />
        <TextInput label="Label" hint="optional" value={label} onChange={(e) => setLabel(e.target.value)} />
        {error && <p className="break-words text-[13px] text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

function BenchmarkDetail({ benchmark: b, onClose }: { benchmark: Benchmark; onClose: () => void }) {
  const unit = useAppStore((s) => s.settings.unit);
  const jobs = useEngineStore((s) => s.jobs);
  const r = b.record;
  const job = jobs.find((j) => j.id === b.job_id);

  const exportRecord = () => {
    const blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aether-benchmark-${b.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={r?.model.name ?? b.id}
      kicker={`${b.id} · ${b.engine} ${b.engine_version ?? ''}`}
      description={describeRun(b)}
      size="lg"
      footer={
        <>
          <Button variant="outline" icon={<Download />} onClick={exportRecord} disabled={!r} className="mr-auto">
            Export record (JSON)
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={jobStatusTone[b.status]} dot>
            {jobStatusLabel[b.status]}
          </Badge>
          {r && <ProvenanceBadge kind="measured" />}
        </div>
        {job?.error && (
          <p className="break-words rounded border border-danger/30 bg-danger/[0.04] px-3 py-2 text-[13px] text-danger">
            {job.error.code}: {job.error.message}
          </p>
        )}
        {!r && !job?.error && <p className="text-[13px] text-ink-mute">No record yet — the run has not completed.</p>}
        {r && (
          <>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              {[
                ['Gen tok/s', r.gen_tps ? `${formatNumber(r.gen_tps.mean, 2)} ± ${formatNumber(r.gen_tps.std ?? 0, 2)} (n=${r.gen_tps.n})` : '—'],
                ['Prompt tok/s', r.prompt_tps ? `${formatNumber(r.prompt_tps.mean, 1)} ± ${formatNumber(r.prompt_tps.std ?? 0, 1)}` : '—'],
                ['TTFT (derived)', r.speed?.ttft_ms != null ? `${formatNumber(r.speed.ttft_ms, 1)} ms` : '—'],
                ['Stability (CV gen)', r.stability.gen_cv != null ? `${formatNumber(r.stability.gen_cv * 100, 2)} %` : '—'],
                ['Peak VRAM', r.speed?.resources.peak_vram_bytes != null ? `${formatBytes(r.speed.resources.peak_vram_bytes, unit)} (${r.speed.resources.vram_method})` : '—'],
                ['Peak RAM', r.speed?.resources.peak_ram_bytes != null ? formatBytes(r.speed.resources.peak_ram_bytes, unit) : '—'],
                ['GPU energy', r.speed?.resources.energy_joules != null ? `${formatNumber(r.speed.resources.energy_joules, 1)} J` : '—'],
                ['Avg power', r.speed?.resources.avg_power_w != null ? `${formatNumber(r.speed.resources.avg_power_w, 1)} W` : '—'],
                ['Perplexity', r.quality.perplexity ? `${formatNumber(r.quality.perplexity.perplexity, 4)} ± ${formatNumber(r.quality.perplexity.uncertainty ?? 0, 4)}` : 'not measured'],
                ['Wall time', r.speed?.resources.wall_time_s != null ? `${formatNumber(r.speed.resources.wall_time_s, 1)} s` : '—'],
                ['Prompt / gen / reps', `${r.params.n_prompt} / ${r.params.n_gen} / ${r.params.repetitions}`],
                ['Quantization', r.model.quantization ?? '—'],
                ['Model fingerprint', r.model.fingerprint ?? '—'],
                ['Hardware fingerprint', r.hardware_fingerprint],
                ['Engine', `${r.engine} ${r.engine_version ?? ''}`],
                ['Recorded', formatDateTime(r.created_at)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-mute">{k}</dt>
                  <dd className="mt-1 break-words text-[13.5px] text-ink-dim">{v}</dd>
                </div>
              ))}
            </dl>
            {r.notes.length > 0 && (
              <ul className="space-y-1 border-l-2 border-warn/60 pl-3 text-[13px] text-ink-dim">
                {r.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
