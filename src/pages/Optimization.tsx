import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, Check, Layers, Play, Square, Trophy } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, ProvenanceBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { RangeField, SelectInput, TextInput, Toggle } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EngineOffline } from '@/components/engine/EngineOffline';
import { api, errorMessage } from '@/api/client';
import type { EstimateResponse, Job, MetricBasis, OptimizationResult, PlacementEstimate } from '@/api/types';
import { formatContext, formatParams, jobStatusLabel, jobStatusTone } from '@/api/adapters';
import { useAppStore } from '@/store/useAppStore';
import { useCapability, useEngineStore } from '@/store/useEngineStore';
import { toast } from '@/store/useToastStore';
import { cn } from '@/utils/cn';
import { formatBytes, formatNumber, percentOf } from '@/utils/format';

const GiB = 1024 ** 3;
const KV_OPTIONS = ['f16/f16', 'q8_0/q8_0', 'q8_0/q4_0', 'q4_0/q4_0'];
const OBJECTIVES = ['quality', 'speed', 'memory', 'energy'] as const;

const riskTone = { none: 'ok', low: 'ok', medium: 'warn', high: 'danger', will_not_fit: 'danger' } as const;

/** Optimization workspace: engine estimates + configuration search jobs. */
export function OptimizationPage() {
  const models = useEngineStore((s) => s.models);
  const profiles = useEngineStore((s) => s.profiles);
  const jobs = useEngineStore((s) => s.jobs);
  const hardware = useEngineStore((s) => s.hardware);
  const connection = useEngineStore((s) => s.connection);
  const refreshCollections = useEngineStore((s) => s.refreshCollections);
  const draft = useAppStore((s) => s.optimizationDraft);
  const updateDraft = useAppStore((s) => s.updateOptimizationDraft);
  const unit = useAppStore((s) => s.settings.unit);
  const bench = useCapability('llama.cpp', 'bench');
  const online = connection === 'online';

  const usable = models.filter((m) => m.status === 'available');
  const model = usable.find((m) => m.id === draft.modelId) ?? usable[0] ?? null;
  const profile = profiles.find((p) => p.id === draft.profile) ?? profiles[1] ?? null;
  const [k, v] = (draft.kvPairs[0] ?? 'f16/f16').split('/');

  /* ------------------------------ live estimate ----------------------------- */
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);

  useEffect(() => {
    if (!online || !model) return;
    const ctrl = new AbortController();
    const id = window.setTimeout(() => {
      setEstimating(true);
      api
        .estimate(
          {
            model_id: model.id,
            n_ctx: draft.contextLength,
            cache_type_k: k,
            cache_type_v: v,
            flash_attn: true,
            max_vram_bytes: draft.maxVramGb != null ? Math.round(draft.maxVramGb * GiB) : null,
            max_ram_bytes: draft.maxRamGb != null ? Math.round(draft.maxRamGb * GiB) : null,
          },
          ctrl.signal,
        )
        .then((r) => {
          setEstimate(r);
          setEstimateError(null);
        })
        .catch((e) => {
          if ((e as Error).name !== 'AbortError') setEstimateError(errorMessage(e));
        })
        .finally(() => setEstimating(false));
    }, 350);
    return () => {
      ctrl.abort();
      window.clearTimeout(id);
    };
  }, [online, model?.id, draft.contextLength, draft.maxVramGb, draft.maxRamGb, k, v]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --------------------------------- search -------------------------------- */
  const optimizationJobs = useMemo(
    () => jobs.filter((j) => j.kind === 'optimization' && (!model || j.params.model_id === model.id)),
    [jobs, model],
  );
  const job: Job | undefined = optimizationJobs.find((j) => j.id === draft.lastJobId) ?? optimizationJobs[0];
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    setResult(null);
    if (!job || job.status !== 'completed') return;
    let alive = true;
    api.jobResults<OptimizationResult>(job.id).then((r) => alive && setResult(r.result)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [job?.id, job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async (confirmed: boolean) => {
    if (!model || !profile) return;
    if (draft.measure && !confirmed) {
      setConfirm(true);
      return;
    }
    setStarting(true);
    try {
      const j = await api.startOptimization({
        model_id: model.id,
        profile: profile.id,
        custom_weights: profile.id === 'custom' ? draft.customWeights : null,
        n_ctx: draft.contextLength,
        max_vram_bytes: draft.maxVramGb != null ? Math.round(draft.maxVramGb * GiB) : null,
        max_ram_bytes: draft.maxRamGb != null ? Math.round(draft.maxRamGb * GiB) : null,
        kv_pairs: draft.kvPairs.map((p) => p.split('/') as [string, string]),
        measure: draft.measure,
        perplexity_dataset: draft.measure && draft.perplexityDataset.trim() ? draft.perplexityDataset.trim() : null,
        repetitions: draft.repetitions,
        confirm: confirmed,
      });
      updateDraft({ lastJobId: j.id });
      setConfirm(false);
      toast.info('Search started', draft.measure ? 'Each candidate is benchmarked on the GPU.' : 'Estimation-only search.');
      await refreshCollections();
    } catch (e) {
      toast.error('Could not start', errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const vramTotal = hardware?.gpus[0]?.vram_total_bytes ?? null;
  const ramTotal = hardware?.memory.total_bytes ?? null;
  const rec = estimate?.memory_plan.recommended ?? null;
  const active = job && (job.status === 'queued' || job.status === 'running');

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Optimization"
        subtitle="Estimate the memory envelope of a model on this machine, then rank runtime configurations by profile."
        meta={<ProvenanceBadge kind={online ? 'live' : 'offline'} />}
      />

      <EngineOffline compact />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-8">
          {/* ----------------------------- model ----------------------------- */}
          <Card>
            <CardHeader
              title="Target model"
              action={
                <Link to="/models" className="focus-ring inline-flex items-center gap-1 rounded font-mono text-[12px] uppercase tracking-[0.12em] text-ink-mute hover:text-accent">
                  library <ArrowUpRight className="h-3 w-3" />
                </Link>
              }
            />
            <CardBody>
              {usable.length === 0 ? (
                <EmptyState compact icon={<Layers />} title="No model available" description="Import a GGUF model in the library first." />
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <SelectInput label="Model" value={model?.id ?? ''} onChange={(e) => updateDraft({ modelId: e.target.value })} wrapperClassName="flex-1">
                    {usable.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — {m.quantization ?? m.format}
                      </option>
                    ))}
                  </SelectInput>
                  {model && (
                    <div className="flex flex-wrap items-center gap-1.5 pb-1.5">
                      <Badge tone="muted" mono>{model.architecture ?? '?'}</Badge>
                      <Badge tone="muted">{formatParams(model.n_params)}</Badge>
                      <Badge tone="muted">{formatBytes(model.file_size_bytes, unit)}</Badge>
                      <Badge tone="muted">ctx {formatContext(model.context_length)}</Badge>
                    </div>
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          {/* --------------------------- estimate ---------------------------- */}
          <Card>
            <CardHeader
              title="Memory placement on this machine"
              hint={`KV ${k}/${v} · context ${formatContext(draft.contextLength)} · flash attention on`}
              action={<ProvenanceBadge kind="estimated" />}
            />
            <CardBody className="space-y-4">
              {estimateError && <p className="text-[13px] text-danger">{estimateError}</p>}
              {!estimate && !estimateError && model && online && <Skeleton className="h-[140px]" />}
              {estimate && (
                <>
                  <div className={cn('flex flex-wrap items-center gap-2', estimating && 'opacity-60')}>
                    {rec ? (
                      <Badge tone={riskTone[rec.oom_risk]} dot>
                        OOM risk: {rec.oom_risk.replace(/_/g, ' ')}
                      </Badge>
                    ) : (
                      <Badge tone="danger" dot>does not fit</Badge>
                    )}
                    <span className="text-[13.5px] text-ink-dim">{estimate.memory_plan.reason}</span>
                  </div>
                  {rec && (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <PlacementBar title="VRAM" total={vramTotal} rec={rec} unit={unit} gpu />
                      <PlacementBar title="RAM" total={ramTotal} rec={rec} unit={unit} gpu={false} />
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div>
                      <div className="mb-1 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-mute">KV cache at {formatContext(draft.contextLength)}</div>
                      <table className="w-full text-left font-mono text-[12.5px] text-ink-dim">
                        <tbody>
                          {estimate.kv_cache.map((kv) => (
                            <tr key={`${kv.cache_type_k}${kv.cache_type_v}`} className="border-t border-line/30">
                              <td className="py-1">{kv.cache_type_k}/{kv.cache_type_v}</td>
                              <td className="text-right">{formatBytes(kv.total_bytes, unit)}</td>
                              <td className="text-right text-ink-mute">{formatNumber(kv.bytes_per_token / 1024, 1)} KiB/tok</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {estimate.kv_cache[0] && !estimate.kv_cache[0].exact_for_architecture && (
                        <p className="mt-1 text-[12px] text-warn">Non-standard attention: upper bound.</p>
                      )}
                    </div>
                    <div>
                      <div className="mb-1 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-mute">GGUF preset sizes (first-order)</div>
                      <table className="w-full text-left font-mono text-[12.5px] text-ink-dim">
                        <tbody>
                          {estimate.quantization_presets
                            .filter((p) => ['Q3_K_M', 'Q4_K_M', 'Q5_K_M', 'Q6_K', 'Q8_0', 'F16'].includes(p.preset))
                            .map((p) => (
                              <tr key={p.preset} className="border-t border-line/30">
                                <td className="py-1">{p.preset}</td>
                                <td className="text-right">{formatBytes(p.estimated_bytes, unit)}</td>
                                <td className="text-right text-ink-mute">{formatNumber(p.bits_per_weight, 2)} bpw</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      <p className="mt-1 text-[12px] text-ink-mute">Real presets keep some tensors at higher precision (≈ +10%).</p>
                    </div>
                  </div>
                  {rec && (
                    <details className="text-[12.5px] text-ink-mute">
                      <summary className="cursor-pointer font-mono uppercase tracking-[0.12em]">Assumptions</summary>
                      <ul className="mt-1 list-disc pl-4">
                        {rec.assumptions.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </CardBody>
          </Card>

          {/* ---------------------------- results ---------------------------- */}
          <Card>
            <CardHeader
              title="Configuration search"
              hint={job ? `${job.id} · ${new Date(job.created_at).toLocaleString()}` : 'No search run yet for this model.'}
              action={job && <Badge tone={jobStatusTone[job.status]} dot>{jobStatusLabel[job.status]}</Badge>}
            />
            <CardBody className="space-y-3">
              {!job && <p className="text-[13px] text-ink-mute">Start a search to rank KV-cache / offload configurations for the selected profile.</p>}
              {active && job && (
                <div>
                  <ProgressBar value={job.progress * 100} height="sm" />
                  <div className="mt-1 flex items-center justify-between font-mono text-[12px] text-ink-mute">
                    <span>{job.stage}</span>
                    <button type="button" className="inline-flex items-center gap-1 hover:text-danger" onClick={() => void api.cancelJob(job.id).then(refreshCollections)}>
                      <Square className="h-3 w-3" /> cancel
                    </button>
                  </div>
                </div>
              )}
              {job?.error && <p className="text-[13px] text-danger">{job.error.code}: {job.error.message}</p>}
              {result && <ResultView result={result} />}
            </CardBody>
          </Card>
        </div>

        {/* ------------------------------ sidebar ----------------------------- */}
        <div className="space-y-3 xl:col-span-4">
          <Card>
            <CardHeader title="Profile" hint="Weights used by the engine's ranking" />
            <CardBody className="space-y-2">
              {profiles.map((p) => {
                const isActive = p.id === profile?.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => updateDraft({ profile: p.id })}
                    className={cn(
                      'focus-ring w-full rounded-md border px-3 py-2 text-left transition-colors',
                      isActive ? 'border-accent/45 bg-accent/[0.05]' : 'border-line/70 bg-raised/30 hover:border-ink-mute/40',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn('flex h-3 w-3 items-center justify-center rounded-full border', isActive ? 'border-accent' : 'border-ink-mute/60')}>
                        {isActive && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                      </span>
                      <span className={cn('text-[13.5px] font-medium', isActive ? 'text-ink' : 'text-ink-dim')}>{p.name}</span>
                    </div>
                    {isActive && <p className="mt-1 pl-5 text-[12.5px] leading-relaxed text-ink-mute">{p.description}</p>}
                    <div className="mt-1.5 grid grid-cols-4 gap-1.5 pl-5">
                      {OBJECTIVES.map((o) => {
                        const w = p.id === 'custom' ? draft.customWeights[o] ?? 0 : p.weights[o];
                        return (
                          <div key={o}>
                            <div className="flex justify-between font-mono text-[11px] uppercase text-ink-mute/80">
                              <span>{o.slice(0, 3)}</span>
                              <span>{Math.round(w * 100)}</span>
                            </div>
                            <ProgressBar value={w * 100} className="mt-0.5" tone={isActive ? 'accent' : 'glacier'} />
                          </div>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
              {profile?.id === 'custom' &&
                OBJECTIVES.map((o) => (
                  <RangeField
                    key={o}
                    label={`${o} weight`}
                    value={Math.round((draft.customWeights[o] ?? 0) * 100)}
                    min={0}
                    max={100}
                    step={5}
                    unit="%"
                    onChange={(val) => updateDraft({ customWeights: { ...draft.customWeights, [o]: val / 100 } })}
                  />
                ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Constraints" hint="Capped by what the engine detects as free" />
            <CardBody className="space-y-3.5">
              <RangeField
                label="Context length"
                value={draft.contextLength}
                min={512}
                max={Math.max(131072, model?.context_length ?? 0)}
                step={512}
                unit="tok"
                onChange={(val) => updateDraft({ contextLength: val })}
              />
              <RangeField
                label="Maximum VRAM"
                value={draft.maxVramGb ?? Math.round((vramTotal ?? 8 * GiB) / GiB)}
                min={1}
                max={Math.max(1, Math.round((vramTotal ?? 8 * GiB) / GiB))}
                step={0.5}
                unit="GiB"
                description={draft.maxVramGb == null ? 'No cap: free VRAM is used.' : undefined}
                onChange={(val) => updateDraft({ maxVramGb: val })}
              />
              <RangeField
                label="Maximum RAM"
                value={draft.maxRamGb ?? Math.round((ramTotal ?? 16 * GiB) / GiB)}
                min={1}
                max={Math.max(1, Math.round((ramTotal ?? 16 * GiB) / GiB))}
                step={1}
                unit="GiB"
                description={draft.maxRamGb == null ? 'No cap: available RAM is used.' : undefined}
                onChange={(val) => updateDraft({ maxRamGb: val })}
              />
              {(draft.maxVramGb != null || draft.maxRamGb != null) && (
                <Button size="sm" variant="ghost" onClick={() => updateDraft({ maxVramGb: null, maxRamGb: null })}>
                  Remove caps
                </Button>
              )}
              <div>
                <div className="mb-1.5 text-[13.5px] font-medium text-ink-dim">KV cache candidates</div>
                <div className="flex flex-wrap gap-1.5">
                  {KV_OPTIONS.map((p) => {
                    const on = draft.kvPairs.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() =>
                          updateDraft({
                            kvPairs: on ? draft.kvPairs.filter((x) => x !== p) : [...draft.kvPairs, p].sort((a, b) => KV_OPTIONS.indexOf(a) - KV_OPTIONS.indexOf(b)),
                          })
                        }
                        className={cn(
                          'focus-ring inline-flex items-center gap-1 rounded border px-2 py-1 font-mono text-[12.5px]',
                          on ? 'border-accent/45 bg-accent/[0.07] text-accent' : 'border-line text-ink-mute hover:text-ink-dim',
                        )}
                      >
                        {on && <Check className="h-2.5 w-2.5" />}
                        {p}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[12px] text-ink-mute">The first selected pair drives the live estimate.</p>
              </div>
            </CardBody>
          </Card>

          <Card className="xl:sticky xl:top-[70px]">
            <CardHeader title="Run" />
            <CardBody className="space-y-3">
              <Toggle
                checked={draft.measure && bench.ok}
                onChange={(m) => updateDraft({ measure: m })}
                disabled={!bench.ok}
                label="Measure with llama-bench"
                description={bench.ok ? 'Benchmarks every feasible candidate on the GPU.' : bench.reason ?? 'llama.cpp unavailable'}
              />
              {draft.measure && bench.ok && (
                <>
                  <TextInput label="Repetitions" type="number" value={String(draft.repetitions)} onChange={(e) => updateDraft({ repetitions: Number(e.target.value) || 1 })} />
                  <TextInput
                    label="Perplexity dataset"
                    hint="optional local .txt — quality stays a proxy without it"
                    value={draft.perplexityDataset}
                    onChange={(e) => updateDraft({ perplexityDataset: e.target.value })}
                  />
                </>
              )}
              {!(draft.measure && bench.ok) && (
                <div className="flex items-start gap-2 border-l-2 border-warn/60 pl-2.5">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warn/80" />
                  <p className="text-[12.5px] leading-relaxed text-ink-dim">
                    Estimation-only: candidates are ranked on estimated memory and a KV-precision proxy. The result is
                    never marked validated.
                  </p>
                </div>
              )}
              <Button
                variant="primary"
                className="w-full"
                icon={<Play />}
                onClick={() => void start(false)}
                loading={starting}
                disabled={!online || !model || !profile || draft.kvPairs.length === 0 || Boolean(active)}
              >
                {active ? 'Search running…' : 'Start search'}
              </Button>
              <p className="text-center font-mono text-[11.5px] uppercase tracking-[0.1em] text-ink-mute/70">
                model weights are never modified
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Benchmark every candidate?"
        kicker="confirmation required"
        description={`${draft.kvPairs.length} configurations × ${draft.repetitions} repetitions will run on the GPU with llama-bench.`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Play />} onClick={() => void start(true)} loading={starting}>
              Confirm
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] text-ink-dim">Close other GPU workloads for clean measurements.</p>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function PlacementBar({ title, total, rec, unit, gpu }: { title: string; total: number | null; rec: PlacementEstimate; unit: 'GB' | 'GiB'; gpu: boolean }) {
  const parts = gpu
    ? [
        ['weights', rec.gpu_weights_bytes, 'bg-accent'],
        ['KV', rec.gpu_kv_bytes, 'bg-glacier'],
        ['compute', rec.compute_buffer_bytes, 'bg-warn'],
        ['CUDA ctx', rec.gpu_overhead_bytes, 'bg-ink-mute/60'],
      ]
    : [
        ['weights', rec.cpu_weights_bytes, 'bg-accent'],
        ['KV', rec.cpu_kv_bytes, 'bg-glacier'],
        ['other', Math.max(0, rec.ram_total_bytes - rec.cpu_weights_bytes - rec.cpu_kv_bytes), 'bg-ink-mute/60'],
      ];
  const used = gpu ? rec.vram_total_bytes : rec.ram_total_bytes;
  const denom = total ?? used;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-mute">
          {title} {gpu && `· ${rec.n_gpu_layers} layers on GPU`}
        </span>
        <span className="readout text-[13px] text-ink">
          {formatBytes(used, unit)}
          {total != null && <span className="text-ink-mute"> / {formatBytes(total, unit)}</span>}
        </span>
      </div>
      <div className="mt-1.5 flex h-2 overflow-hidden rounded-sm bg-surface2">
        {parts.map(([label, bytes, color]) => (
          <div key={label as string} className={color as string} style={{ width: `${percentOf(bytes as number, denom)}%` }} title={`${label}: ${formatBytes(bytes as number, unit)}`} />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[11.5px] text-ink-mute">
        {parts.map(([label, bytes, color]) => (
          <span key={label as string} className="inline-flex items-center gap-1">
            <span className={cn('h-1.5 w-1.5 rounded-[1px]', color as string)} />
            {label} {formatBytes(bytes as number, unit)}
          </span>
        ))}
      </div>
    </div>
  );
}

const basisKind = (b: MetricBasis) => (b === 'measured' ? 'measured' : b === 'estimated' ? 'estimated' : 'proxy');

function ResultView({ result }: { result: OptimizationResult }) {
  const unit = useAppStore((s) => s.settings.unit);
  const fmt = (o: string, value: number) => {
    if (o === 'memory') return formatBytes(value, unit);
    if (o === 'speed') return `${formatNumber(value, 1)} tok/s`;
    if (o === 'energy') return `${formatNumber(value, 3)} J/tok`;
    if (o === 'quality') return value < 0 ? `PPL ${formatNumber(-value, 3)}` : `${formatNumber(value, 1)} KV bits`;
    return String(value);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={result.validated ? 'ok' : 'warn'} dot>
          {result.validated ? 'validated by measurement' : 'not validated'}
        </Badge>
        <Badge tone="muted">{result.outcome === 'measured' ? 'measured search' : 'estimation only'}</Badge>
        <Badge tone="muted">weights unchanged</Badge>
      </div>
      {result.candidates.length === 0 ? (
        <p className="text-[13px] text-ink-mute">No feasible candidate.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-ink-mute/70">
              <tr>
                <th className="py-1">#</th>
                <th>Configuration</th>
                {OBJECTIVES.map((o) => (
                  <th key={o}>{o}</th>
                ))}
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {result.candidates.map((c, i) => (
                <tr key={c.id} className={cn('border-t border-line/30 text-ink-dim', i === 0 && 'bg-accent/[0.04]')}>
                  <td className="py-1.5 font-mono">{i === 0 ? <Trophy className="h-3.5 w-3.5 text-accent" /> : i + 1}</td>
                  <td className="font-mono text-[12.5px]">
                    KV {c.config.cache_type_k}/{c.config.cache_type_v} · ngl {c.config.n_gpu_layers}
                    {c.pareto_optimal && <span className="ml-1 text-accent" title="Pareto-optimal">◆</span>}
                  </td>
                  {OBJECTIVES.map((o) => {
                    const m = c.metrics[o];
                    return (
                      <td key={o} className="font-mono text-[12.5px]">
                        {m ? (
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            {fmt(o, m.value)}
                            <ProvenanceBadge kind={basisKind(m.basis)} className="scale-90" />
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    );
                  })}
                  <td className="font-mono">{formatNumber(c.score, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="space-y-0.5 text-[12.5px] text-ink-mute">
        {result.notes.map((n) => (
          <li key={n}>· {n}</li>
        ))}
      </ul>
    </div>
  );
}
