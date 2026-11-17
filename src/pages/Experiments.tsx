import { useMemo, useState } from 'react';
import { AlertTriangle, FlaskConical, Play, Plus, Square, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, ProvenanceBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectInput, Segmented, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ExperimentTable } from '@/components/tables/ExperimentTable';
import { EngineOffline } from '@/components/engine/EngineOffline';
import { api, ApiError, errorMessage } from '@/api/client';
import type { Experiment, ExperimentStatus, ExperimentType, ModelSummary } from '@/api/types';
import { jobStatusLabel, jobStatusTone, modelLabel } from '@/api/adapters';
import { useAppStore } from '@/store/useAppStore';
import { useEngineStore } from '@/store/useEngineStore';
import { toast } from '@/store/useToastStore';
import { cn } from '@/utils/cn';
import { formatBytes, formatDateTime, formatNumber } from '@/utils/format';

type Filter = 'all' | ExperimentStatus;
const FILTERS: Filter[] = ['all', 'draft', 'queued', 'running', 'completed', 'failed', 'cancelled'];

const KV_PAIRS: [string, string][] = [
  ['f16', 'f16'],
  ['q8_0', 'q8_0'],
  ['q8_0', 'q4_0'],
  ['q4_0', 'q4_0'],
];
const PRESETS = ['Q2_K', 'Q3_K_M', 'Q4_K_M', 'Q5_K_M', 'Q6_K', 'Q8_0'];
const UNQUANTIZED = new Set(['F16', 'BF16', 'F32']);

/** Experiments run by the engine as background jobs. */
export function ExperimentsPage() {
  const experiments = useEngineStore((s) => s.experiments);
  const models = useEngineStore((s) => s.models);
  const types = useEngineStore((s) => s.experimentTypes);
  const connection = useEngineStore((s) => s.connection);
  const online = connection === 'online';

  const [filter, setFilter] = useState<Filter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: experiments.length };
    FILTERS.slice(1).forEach((f) => (c[f] = experiments.filter((e) => e.status === f).length));
    return c;
  }, [experiments]);

  const filtered = filter === 'all' ? experiments : experiments.filter((e) => e.status === filter);
  const detail = detailId ? experiments.find((e) => e.id === detailId) ?? null : null;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Experiments"
        subtitle="Reproducible experiments executed by the engine. Results are measured or explicitly labelled as proxies."
        meta={<ProvenanceBadge kind={online ? 'live' : 'offline'} />}
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setCreateOpen(true)} disabled={!online || models.length === 0}>
            New experiment
          </Button>
        }
      />

      <EngineOffline compact />

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              Experiments
              <span className="readout text-[13px] font-normal text-ink-mute">
                {filtered.length}/{experiments.length}
              </span>
            </span>
          }
          hint="One heavy job runs at a time on the engine (8 GB VRAM target)."
        />

        <div className="flex flex-wrap items-center gap-2 border-b border-line/40 px-5 py-2.5">
          <Segmented<Filter>
            ariaLabel="Filter experiments by status"
            value={filter}
            onChange={setFilter}
            options={FILTERS.map((f) => ({
              value: f,
              label: f === 'all' ? 'All' : jobStatusLabel[f],
              count: counts[f] ?? 0,
            }))}
          />
        </div>

        {experiments.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={<FlaskConical />}
              title="No experiments yet"
              description={
                models.length === 0
                  ? 'Import a model first, then create an experiment.'
                  : 'Create an experiment: quantization sensitivity (CPU), KV cache or preset comparison (GPU, llama.cpp).'
              }
              action={
                <Button variant="primary" icon={<Plus />} onClick={() => setCreateOpen(true)} disabled={!online || models.length === 0}>
                  New experiment
                </Button>
              }
            />
          </CardBody>
        ) : filtered.length === 0 ? (
          <CardBody>
            <EmptyState compact icon={<FlaskConical />} title="Nothing with this status" description="Change the filter." />
          </CardBody>
        ) : (
          <ExperimentTable experiments={filtered} models={models} types={types} onOpen={(e) => setDetailId(e.id)} />
        )}
      </Card>

      {createOpen && (
        <CreateExperimentDialog
          models={models}
          types={types}
          onClose={() => setCreateOpen(false)}
          onCreated={(e) => {
            setCreateOpen(false);
            setDetailId(e.id);
          }}
        />
      )}
      {detail && <ExperimentDetail experiment={detail} onClose={() => setDetailId(null)} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CreateExperimentDialog({
  models,
  types,
  onClose,
  onCreated,
}: {
  models: ModelSummary[];
  types: ExperimentType[];
  onClose: () => void;
  onCreated: (e: Experiment) => void;
}) {
  const refreshCollections = useEngineStore((s) => s.refreshCollections);
  const [typeId, setTypeId] = useState(types[0]?.id ?? 'quantization_sensitivity');
  const [name, setName] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [modelId, setModelId] = useState(models[0]?.id ?? '');
  // type-specific
  const [budgets, setBudgets] = useState('3.5, 4.5, 5.5');
  const [maxRows, setMaxRows] = useState('4096');
  const [pairs, setPairs] = useState<string[]>(['f16/f16', 'q8_0/q8_0', 'q4_0/q4_0']);
  const [presets, setPresets] = useState<string[]>(['Q4_K_M', 'Q5_K_M', 'Q8_0']);
  const [nCtx, setNCtx] = useState('4096');
  const [reps, setReps] = useState('3');
  const [ngl, setNgl] = useState('99');
  const [pplPath, setPplPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const type = types.find((t) => t.id === typeId);
  const model = models.find((m) => m.id === modelId);
  const needsUnquantized = typeId === 'quantization_sensitivity' || typeId === 'quantization_comparison';
  const quantWarning =
    needsUnquantized && model && !UNQUANTIZED.has(model.quantization ?? '')
      ? `${model.name} is ${model.quantization ?? 'of unknown precision'}: this experiment needs an F16/BF16/F32 source.`
      : null;

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const buildConfig = (): Record<string, unknown> => {
    const num = (s: string) => Number(s);
    if (typeId === 'quantization_sensitivity')
      return {
        model_id: modelId,
        budgets_bits_per_weight: budgets.split(/[,\s]+/).filter(Boolean).map(Number),
        max_rows: maxRows ? num(maxRows) : null,
      };
    if (typeId === 'kv_cache_comparison')
      return {
        model_id: modelId,
        pairs: pairs.map((p) => p.split('/')),
        n_ctx: num(nCtx),
        repetitions: num(reps),
        n_gpu_layers: num(ngl),
        perplexity_dataset: pplPath.trim() || null,
      };
    return {
      model_id: modelId,
      presets,
      repetitions: num(reps),
      n_gpu_layers: num(ngl),
      perplexity_dataset: pplPath.trim() || null,
    };
  };

  const submit = async () => {
    if (name.trim().length < 3) {
      setError('Name must have at least 3 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const e = await api.createExperiment({
        name: name.trim(),
        type: typeId,
        hypothesis: hypothesis.trim() || undefined,
        config: buildConfig(),
      });
      toast.success('Experiment created', `"${e.name}" is a draft. Start it from its detail sheet.`);
      await refreshCollections();
      onCreated(e);
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
      title="New experiment"
      kicker="engine · experiment"
      description={type?.description}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Plus />} onClick={() => void submit()} loading={busy}>
            Create draft
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectInput label="Experiment type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </SelectInput>
          <SelectInput label="Model" value={modelId} onChange={(e) => setModelId(e.target.value)}>
            {models.map((m) => (
              <option key={m.id} value={m.id} disabled={m.status !== 'available'}>
                {m.name} — {m.quantization ?? m.format}
              </option>
            ))}
          </SelectInput>
        </div>
        {type && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={type.cost === 'expensive' ? 'warn' : 'neutral'} dot>
              cost: {type.cost}
            </Badge>
            {type.requires.map((r) => (
              <Badge key={r} tone="muted">
                {r}
              </Badge>
            ))}
          </div>
        )}
        {quantWarning && (
          <p className="flex items-start gap-2 text-[13px] text-warn">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            {quantWarning}
          </p>
        )}

        <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="EXP-001 Qwen2.5-0.5B sensitivity" autoFocus />
        <TextArea label="Hypothesis" rows={2} value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} placeholder="What do you expect to observe?" />

        {typeId === 'quantization_sensitivity' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextInput label="Budgets" hint="bits / weight, comma separated" value={budgets} onChange={(e) => setBudgets(e.target.value)} />
            <TextInput label="Rows sampled per tensor" hint="empty = all" type="number" value={maxRows} onChange={(e) => setMaxRows(e.target.value)} />
          </div>
        )}

        {typeId === 'kv_cache_comparison' && (
          <div>
            <div className="mb-1.5 text-[13.5px] font-medium text-ink-dim">KV cache pairs (K / V)</div>
            <div className="flex flex-wrap gap-1.5">
              {KV_PAIRS.map(([k, v]) => {
                const id = `${k}/${v}`;
                return (
                  <ChipToggle key={id} active={pairs.includes(id)} onClick={() => toggle(pairs, setPairs, id)}>
                    {id}
                  </ChipToggle>
                );
              })}
            </div>
          </div>
        )}

        {typeId === 'quantization_comparison' && (
          <div>
            <div className="mb-1.5 text-[13.5px] font-medium text-ink-dim">llama.cpp presets</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <ChipToggle key={p} active={presets.includes(p)} onClick={() => toggle(presets, setPresets, p)}>
                  {p}
                </ChipToggle>
              ))}
            </div>
          </div>
        )}

        {typeId !== 'quantization_sensitivity' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {typeId === 'kv_cache_comparison' && (
              <TextInput label="Context" hint="tokens" type="number" value={nCtx} onChange={(e) => setNCtx(e.target.value)} />
            )}
            <TextInput label="Repetitions" type="number" value={reps} onChange={(e) => setReps(e.target.value)} />
            <TextInput label="GPU layers" hint="-ngl" type="number" value={ngl} onChange={(e) => setNgl(e.target.value)} />
            <TextInput
              label="Perplexity dataset"
              hint="absolute path to a local .txt (optional)"
              value={pplPath}
              onChange={(e) => setPplPath(e.target.value)}
              wrapperClassName="sm:col-span-3"
            />
          </div>
        )}
        {error && <p className="break-words text-[13px] text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

function ChipToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'focus-ring rounded border px-2 py-1 font-mono text-[12.5px] transition-colors',
        active ? 'border-accent/45 bg-accent/[0.07] text-accent' : 'border-line bg-raised/30 text-ink-mute hover:text-ink-dim',
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */

function ExperimentDetail({ experiment: e, onClose }: { experiment: Experiment; onClose: () => void }) {
  const models = useEngineStore((s) => s.models);
  const types = useEngineStore((s) => s.experimentTypes);
  const refreshCollections = useEngineStore((s) => s.refreshCollections);
  const [confirmStart, setConfirmStart] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const full = e;

  const type = types.find((t) => t.id === e.type);
  const active = e.status === 'queued' || e.status === 'running';

  const start = async (confirm: boolean) => {
    setBusy(true);
    try {
      await api.startExperiment(e.id, confirm);
      toast.info('Experiment started', `"${e.name}" was queued on the engine.`);
      setConfirmStart(false);
      await refreshCollections();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFIRMATION_REQUIRED') setConfirmStart(true);
      else toast.error('Could not start', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!e.job_id) return;
    try {
      await api.cancelJob(e.job_id);
      toast.info('Cancellation requested', 'The engine stops the job at its next checkpoint.');
      await refreshCollections();
    } catch (err) {
      toast.error('Cancel failed', errorMessage(err));
    }
  };

  const remove = async () => {
    try {
      await api.deleteExperiment(e.id);
      toast.info('Experiment deleted', `"${e.name}" was removed. Its benchmark records are kept.`);
      await refreshCollections();
      onClose();
    } catch (err) {
      toast.error('Delete failed', errorMessage(err));
    }
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={e.name}
        kicker={`${e.id} · ${type?.name ?? e.type}`}
        size="lg"
        footer={
          <>
            <Button variant="danger" icon={<Trash2 />} onClick={() => setConfirmDelete(true)} className="mr-auto" disabled={active}>
              Delete
            </Button>
            {active ? (
              <Button variant="outline" icon={<Square />} onClick={() => void cancel()}>
                Cancel job
              </Button>
            ) : (
              <Button variant="primary" icon={<Play />} onClick={() => void start(false)} loading={busy}>
                {e.status === 'draft' ? 'Start' : 'Run again'}
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={jobStatusTone[e.status]} dot>
              {jobStatusLabel[e.status]}
            </Badge>
            {type && <Badge tone={type.cost === 'expensive' ? 'warn' : 'muted'}>cost: {type.cost}</Badge>}
            <span className="font-mono text-[12px] text-ink-mute">model: {modelLabel(models, e.model_id)}</span>
          </div>

          {full.job && (active || full.job.error) && (
            <div>
              {active && (
                <>
                  <ProgressBar value={full.job.progress * 100} height="sm" />
                  <div className="mt-1 font-mono text-[12px] text-ink-mute">
                    {formatNumber(full.job.progress * 100, 0)}% · {full.job.stage}
                  </div>
                </>
              )}
              {full.job.error && (
                <p className="mt-1 break-words rounded border border-danger/30 bg-danger/[0.04] px-3 py-2 text-[13px] text-danger">
                  {full.job.error.code}: {full.job.error.message}
                </p>
              )}
            </div>
          )}

          {e.hypothesis && (
            <div>
              <div className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-mute">Hypothesis</div>
              <p className="mt-1 text-[13.5px] leading-relaxed text-ink-dim">{e.hypothesis}</p>
            </div>
          )}

          <ExperimentResult experiment={e} />

          <details className="rounded border border-line/60 px-3 py-2">
            <summary className="cursor-pointer font-mono text-[12px] uppercase tracking-[0.12em] text-ink-mute">
              Configuration · created {formatDateTime(e.created_at)}
            </summary>
            <pre className="mt-2 overflow-x-auto font-mono text-[12px] text-ink-dim">{JSON.stringify(e.config, null, 2)}</pre>
          </details>
        </div>
      </Modal>

      <Modal
        open={confirmStart}
        onClose={() => setConfirmStart(false)}
        title="Run an expensive experiment?"
        kicker="confirmation required"
        description="This experiment loads models on the GPU and may write multi-GB files. Other GPU work should be stopped."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmStart(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Play />} onClick={() => void start(true)} loading={busy}>
              Confirm and run
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] text-ink-dim">Requires: {type?.requires.join(', ')}</p>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete experiment?"
        kicker="confirmation"
        description="The experiment record is deleted from the engine database. Benchmarks it produced are kept."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" icon={<Trash2 />} onClick={() => void remove()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] text-ink-dim">{e.name}</p>
      </Modal>
    </>
  );
}

/* ------------------------------ result views ------------------------------ */

interface SensitivityResult {
  validated: boolean;
  validation_note: string;
  n_quantizable_params: number;
  sensitivities: { name: string; n_params: number; errors: Record<string, number> }[];
  comparisons: {
    budget_bits_per_weight: number;
    adaptive: { bits_per_weight: number; proxy_distortion: number; type_histogram: Record<string, number>; feasible: boolean };
    best_uniform_within_budget: { method: string; bits_per_weight: number; proxy_distortion: number } | null;
    proxy_distortion_ratio: number | null;
  }[];
}

interface RowsResult {
  validated: boolean;
  note: string | null;
  rows: {
    cache_type_k?: string;
    cache_type_v?: string;
    preset?: string;
    file_size_bytes?: number;
    kv_estimate?: { total_bytes: number };
    record: {
      gen_tps: { mean: number; std: number | null } | null;
      prompt_tps: { mean: number } | null;
      speed: { resources: { peak_vram_bytes: number | null; peak_ram_bytes: number | null } } | null;
      quality: { perplexity?: { perplexity: number; uncertainty: number | null } };
    };
  }[];
}

function ExperimentResult({ experiment: e }: { experiment: Experiment }) {
  const unit = useAppStore((s) => s.settings.unit);
  if (!e.result) {
    return e.status === 'completed' ? null : (
      <p className="text-[13px] text-ink-mute">No result yet — nothing is displayed until the engine produces it.</p>
    );
  }
  const r = e.result as unknown;

  if (e.type === 'quantization_sensitivity') {
    const s = r as SensitivityResult;
    const top = [...s.sensitivities]
      .sort((a, b) => (b.errors['4'] ?? 0) - (a.errors['4'] ?? 0))
      .slice(0, 8);
    return (
      <div className="space-y-3">
        <ValidationNote validated={s.validated} note={s.validation_note} />
        <table className="w-full text-left text-[13px]">
          <thead className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-ink-mute/70">
            <tr>
              <th className="py-1">Budget</th>
              <th>Adaptive</th>
              <th>Mix</th>
              <th>Best uniform</th>
              <th>Distortion ratio</th>
            </tr>
          </thead>
          <tbody>
            {s.comparisons.map((c) => (
              <tr key={c.budget_bits_per_weight} className="border-t border-line/30 text-ink-dim">
                <td className="py-1.5 font-mono">{c.budget_bits_per_weight} bpw</td>
                <td className="font-mono">{formatNumber(c.adaptive.bits_per_weight, 3)} bpw</td>
                <td className="font-mono text-[12px]">
                  {Object.entries(c.adaptive.type_histogram).map(([t, n]) => `${n}×${t}`).join(' ')}
                </td>
                <td className="font-mono">
                  {c.best_uniform_within_budget
                    ? `${c.best_uniform_within_budget.method} (${formatNumber(c.best_uniform_within_budget.bits_per_weight, 3)})`
                    : '—'}
                </td>
                <td className="font-mono">{c.proxy_distortion_ratio != null ? formatNumber(c.proxy_distortion_ratio, 3) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          <div className="mb-1 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-mute">
            Most sensitive tensors (4-bit proxy error)
          </div>
          <ul className="space-y-0.5 font-mono text-[12.5px] text-ink-dim">
            {top.map((t) => (
              <li key={t.name} className="flex justify-between gap-3">
                <span className="truncate">{t.name}</span>
                <span>{(t.errors['4'] ?? 0).toExponential(3)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const rr = r as RowsResult;
  if (Array.isArray(rr.rows)) {
    return (
      <div className="space-y-3">
        <ValidationNote validated={rr.validated} note={rr.note ?? undefined} />
        <table className="w-full text-left text-[13px]">
          <thead className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-ink-mute/70">
            <tr>
              <th className="py-1">Config</th>
              <th>Gen tok/s</th>
              <th>Prompt tok/s</th>
              <th>Peak VRAM</th>
              <th>Peak RAM</th>
              <th>PPL</th>
            </tr>
          </thead>
          <tbody>
            {rr.rows.map((row, i) => {
              const rec = row.record;
              const ppl = rec.quality.perplexity;
              return (
                <tr key={i} className="border-t border-line/30 font-mono text-ink-dim">
                  <td className="py-1.5">
                    {row.preset ?? `${row.cache_type_k}/${row.cache_type_v}`}
                    {row.kv_estimate && (
                      <span className="ml-1 text-[11.5px] text-ink-mute">(KV est. {formatBytes(row.kv_estimate.total_bytes, unit)})</span>
                    )}
                  </td>
                  <td>{rec.gen_tps ? `${formatNumber(rec.gen_tps.mean, 1)} ± ${formatNumber(rec.gen_tps.std ?? 0, 1)}` : '—'}</td>
                  <td>{rec.prompt_tps ? formatNumber(rec.prompt_tps.mean, 0) : '—'}</td>
                  <td>{rec.speed?.resources.peak_vram_bytes != null ? formatBytes(rec.speed.resources.peak_vram_bytes, unit) : '—'}</td>
                  <td>{rec.speed?.resources.peak_ram_bytes != null ? formatBytes(rec.speed.resources.peak_ram_bytes, unit) : '—'}</td>
                  <td>{ppl ? `${formatNumber(ppl.perplexity, 3)} ± ${formatNumber(ppl.uncertainty ?? 0, 3)}` : 'not measured'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return <pre className="overflow-x-auto font-mono text-[12px] text-ink-dim">{JSON.stringify(e.result, null, 2)}</pre>;
}

function ValidationNote({ validated, note }: { validated: boolean; note?: string }) {
  return (
    <div className={cn('flex items-start gap-2 border-l-2 pl-3 text-[13px]', validated ? 'border-ok/60 text-ink-dim' : 'border-warn/60 text-ink-dim')}>
      <ProvenanceBadge kind={validated ? 'measured' : 'proxy'} />
      <span>{note ?? (validated ? 'Measured on this machine.' : 'Not validated by an output-space measurement.')}</span>
    </div>
  );
}
