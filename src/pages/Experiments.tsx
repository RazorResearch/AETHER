import { useMemo, useState } from 'react';
import { FlaskConical, Info, Plus, Trash2, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, ProvenanceBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectInput, Segmented, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ExperimentTable, experimentStatusTone } from '@/components/tables/ExperimentTable';
import { useAppStore } from '@/store/useAppStore';
import { experimentStatuses } from '@/store/defaults';
import { optimizationStrategies, optimizationTargets } from '@/data/demo';
import { toast } from '@/store/useToastStore';
import type { Experiment, ExperimentStatus, OptimizationStrategyId } from '@/types';
import { formatDateTime, formatRelative } from '@/utils/format';
import { cn } from '@/utils/cn';

type Filter = 'All' | ExperimentStatus;

/** Scientific experiment manager. Records persist in localStorage. */
export function ExperimentsPage() {
  const experiments = useAppStore((state) => state.experiments);
  const models = useAppStore((state) => state.models);
  const addExperiment = useAppStore((state) => state.addExperiment);
  const setExperimentStatus = useAppStore((state) => state.setExperimentStatus);
  const removeExperiment = useAppStore((state) => state.removeExperiment);

  const [filter, setFilter] = useState<Filter>('All');
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Experiment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Experiment | null>(null);

  const counts = useMemo<Record<string, number>>(() => {
    const byStatus = experimentStatuses.reduce<Record<string, number>>((acc, status) => {
      acc[status] = experiments.filter((item) => item.status === status).length;
      return acc;
    }, {});
    return { All: experiments.length, ...byStatus };
  }, [experiments]);

  const filtered = useMemo(
    () => (filter === 'All' ? experiments : experiments.filter((item) => item.status === filter)),
    [experiments, filter],
  );

  /* Keep the open detail sheet in sync with store updates. */
  const activeDetail = detail ? experiments.find((item) => item.id === detail.id) ?? null : null;

  const handleDelete = () => {
    if (!deleteTarget) return;
    removeExperiment(deleteTarget.id);
    toast.info('Experiment deleted', `"${deleteTarget.name}" was removed from local storage.`);
    setDeleteTarget(null);
    setDetail(null);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Experiments"
        subtitle="Plan, track and review optimization experiments. Stored in this browser only."
        code="workspace / experiments"
        meta={<ProvenanceBadge />}
        actions={
          <Button
            variant="primary"
            icon={<Plus />}
            onClick={() => setCreateOpen(true)}
            disabled={models.length === 0}
          >
            New experiment
          </Button>
        }
      />

      <Card>
        <CardHeader
          kicker="experiment registry"
          title={
            <span className="flex items-center gap-2">
              Experiments
              <span className="readout text-[11px] font-normal text-ink-mute">
                {filtered.length}/{experiments.length}
              </span>
            </span>
          }
          hint="Running and Completed are demonstration states — no experiment is actually executed."
          action={<Badge tone="muted" dot>local persistence</Badge>}
        />

        <div className="flex flex-wrap items-center gap-2 border-b border-line/40 px-5 py-2.5">
          <Segmented<Filter>
            ariaLabel="Filter experiments by status"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'All', label: 'All', count: counts.All },
              ...experimentStatuses.map((status) => ({
                value: status,
                label: status,
                count: counts[status] ?? 0,
              })),
            ]}
          />
          <span className="ml-auto hidden items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute/70 sm:flex">
            <Info className="h-3 w-3" />
            {filter === 'All' ? 'all statuses' : filter.toLowerCase()}
          </span>
        </div>

        {experiments.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={<FlaskConical />}
              title="No experiments yet"
              description="Create an experiment to define a model, a hypothesis and the strategies you want to evaluate."
              action={
                <Button
                  variant="primary"
                  icon={<Plus />}
                  onClick={() => setCreateOpen(true)}
                  disabled={models.length === 0}
                >
                  New experiment
                </Button>
              }
            />
            {models.length === 0 && (
              <p className="mt-3 text-center text-[10.5px] text-ink-mute">
                A model must be registered in the library first.
              </p>
            )}
          </CardBody>
        ) : filtered.length === 0 ? (
          <CardBody>
            <EmptyState
              compact
              icon={<FlaskConical />}
              title={`No ${filter.toLowerCase()} experiments`}
              description="Change the status filter or create a new experiment to populate this view."
              action={
                <Button variant="secondary" onClick={() => setFilter('All')}>
                  Show all
                </Button>
              }
            />
          </CardBody>
        ) : (
          <ExperimentTable experiments={filtered} models={models} onOpen={setDetail} />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/40 px-5 py-2.5">
          <p className="text-[10.5px] text-ink-mute">
            Records are persisted with <span className="font-mono text-ink-mute/90">localStorage</span>{' '}
            — no account, no remote sync.
          </p>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute/60">
            {experiments.length} records
          </span>
        </div>
      </Card>

      {createOpen && (
        <CreateExperimentDialog
          models={models}
          onClose={() => setCreateOpen(false)}
          onSubmit={(input) => {
            addExperiment(input);
            setCreateOpen(false);
            toast.success('Experiment created', `"${input.name}" was registered with status ${input.status}.`);
          }}
        />
      )}

      {/* ----------------------------- detail ----------------------------- */}
      <Modal
        open={Boolean(activeDetail)}
        onClose={() => setDetail(null)}
        title={activeDetail?.name ?? 'Experiment'}
        kicker={activeDetail ? `experiment ${activeDetail.id}` : 'experiment'}
        size="lg"
        footer={
          <>
            <Button
              variant="danger"
              icon={<Trash2 />}
              onClick={() => setDeleteTarget(activeDetail)}
              className="mr-auto"
            >
              Delete
            </Button>
            <Button variant="secondary" onClick={() => setDetail(null)}>
              Close
            </Button>
          </>
        }
      >
        {activeDetail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={experimentStatusTone[activeDetail.status]}
                dot
                pulse={activeDetail.status === 'Running'}
              >
                {activeDetail.status}
              </Badge>
              <Badge tone="muted">
                {optimizationTargets.find((target) => target.id === activeDetail.target)?.label}
              </Badge>
              <span className="font-mono text-[9.5px] text-ink-mute">
                updated {formatRelative(activeDetail.updatedAt)}
              </span>
            </div>

            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
                Hypothesis / description
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-dim">
                {activeDetail.description || 'No description provided.'}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {[
                [
                  'Model',
                  models.find((model) => model.id === activeDetail.modelId)?.name ?? 'Missing model',
                ],
                ['Created', formatDateTime(activeDetail.createdAt)],
                ['Updated', formatDateTime(activeDetail.updatedAt)],
                ['Target', optimizationTargets.find((t) => t.id === activeDetail.target)?.label ?? '—'],
                ['Strategies', String(activeDetail.strategyIds.length)],
                ['Record id', activeDetail.id],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
                    {label}
                  </dt>
                  <dd className="mt-1 break-words text-[11.5px] text-ink-dim">{value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
                Strategies under test
              </div>
              <ul className="divide-y divide-line/40 overflow-hidden rounded-md border border-line/60">
                {activeDetail.strategyIds.map((id) => {
                  const strategy = optimizationStrategies.find((item) => item.id === id);
                  return (
                    <li key={id} className="flex items-start gap-2.5 bg-raised/30 px-3 py-2">
                      <span className="mt-0.5 rounded border border-line/70 px-1 py-[1px] font-mono text-[8.5px] uppercase tracking-[0.08em] text-ink-mute">
                        {strategy?.code ?? id}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[11.5px] text-ink-dim">{strategy?.label ?? id}</div>
                        <div className="text-[10px] leading-relaxed text-ink-mute">
                          {strategy?.description}
                        </div>
                      </div>
                    </li>
                  );
                })}
                {activeDetail.strategyIds.length === 0 && (
                  <li className="px-3 py-2 text-[11px] text-ink-mute">
                    No strategy attached to this experiment.
                  </li>
                )}
              </ul>
            </div>

            <SelectInput
              label="Demonstration status"
              hint="local only"
              value={activeDetail.status}
              onChange={(event) =>
                setExperimentStatus(activeDetail.id, event.target.value as ExperimentStatus)
              }
            >
              {experimentStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </SelectInput>
            <p className="text-[10px] leading-relaxed text-ink-mute">
              Changing the status records a local event. No run is scheduled, started or completed.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete experiment?"
        kicker="confirmation"
        description="The record will be removed from local storage. This action cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon={<Trash2 />} onClick={handleDelete}>
              Delete experiment
            </Button>
          </>
        }
      >
        <div className="rounded-md border border-danger/25 bg-danger/[0.05] px-3 py-2.5 text-[11.5px] text-ink-dim">
          <span className="text-ink">{deleteTarget?.name}</span> and its configuration will be
          discarded.
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Creation dialog                                                            */
/* -------------------------------------------------------------------------- */

interface CreateExperimentDialogProps {
  models: ReturnType<typeof useAppStore.getState>['models'];
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    modelId: string;
    description: string;
    strategyIds: OptimizationStrategyId[];
    target: Experiment['target'];
    status: ExperimentStatus;
  }) => void;
}

function CreateExperimentDialog({ models, onClose, onSubmit }: CreateExperimentDialogProps) {
  const [name, setName] = useState('');
  const [modelId, setModelId] = useState(models[0]?.id ?? '');
  const [description, setDescription] = useState('');
  const [strategyIds, setStrategyIds] = useState<OptimizationStrategyId[]>([]);
  const [target, setTarget] = useState<Experiment['target']>('balanced');
  const [status, setStatus] = useState<ExperimentStatus>('Draft');
  const [errors, setErrors] = useState<{ name?: string; model?: string; strategies?: string }>({});

  const toggle = (id: OptimizationStrategyId) =>
    setStrategyIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  const submit = () => {
    const nextErrors: typeof errors = {};
    if (name.trim().length < 3) nextErrors.name = 'Provide a name of at least 3 characters.';
    if (!modelId) nextErrors.model = 'Select a model from the library.';
    if (strategyIds.length === 0) nextErrors.strategies = 'Select at least one strategy to test.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast.error('Experiment not created', 'Fix the highlighted fields and try again.');
      return;
    }
    onSubmit({ name, modelId, description, strategyIds, target, status });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New experiment"
      kicker="experiment · draft"
      description="Define a hypothesis and the strategies to evaluate once the engine is available."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Plus />} onClick={submit}>
            Create experiment
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <TextInput
          label="Experiment name"
          placeholder="KV cache precision sweep"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setErrors((current) => ({ ...current, name: undefined }));
          }}
          autoFocus
        />
        {errors.name && <p className="-mt-1.5 text-[10.5px] text-danger">{errors.name}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectInput
            label="Model"
            value={modelId}
            onChange={(event) => {
              setModelId(event.target.value);
              setErrors((current) => ({ ...current, model: undefined }));
            }}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </SelectInput>
          <SelectInput
            label="Optimization target"
            value={target}
            onChange={(event) => setTarget(event.target.value as Experiment['target'])}
          >
            {optimizationTargets.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </SelectInput>
        </div>
        {errors.model && <p className="-mt-1.5 text-[10.5px] text-danger">{errors.model}</p>}

        <TextArea
          label="Description / hypothesis"
          rows={3}
          placeholder="What do you expect to observe, and under which constraints?"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[11.5px] font-medium text-ink-dim">Strategies to test</span>
            <span className="font-mono text-[10px] text-ink-mute">{strategyIds.length} selected</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {optimizationStrategies.map((strategy) => {
              const active = strategyIds.includes(strategy.id);
              return (
                <button
                  key={strategy.id}
                  type="button"
                  onClick={() => {
                    toggle(strategy.id);
                    setErrors((current) => ({ ...current, strategies: undefined }));
                  }}
                  className={cn(
                    'focus-ring inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] transition-colors',
                    active
                      ? 'border-accent/45 bg-accent/[0.07] text-accent'
                      : 'border-line bg-raised/30 text-ink-mute hover:border-ink-mute/40 hover:text-ink-dim',
                  )}
                >
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.06em]">
                    {strategy.code}
                  </span>
                  {strategy.label}
                  {active && <X className="h-2.5 w-2.5 opacity-70" />}
                </button>
              );
            })}
          </div>
          {errors.strategies && (
            <p className="mt-1.5 text-[10.5px] text-danger">{errors.strategies}</p>
          )}
        </div>

        <SelectInput
          label="Initial status"
          hint="demo states"
          value={status}
          onChange={(event) => setStatus(event.target.value as ExperimentStatus)}
        >
          {experimentStatuses.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </SelectInput>
        <p className="text-[10px] leading-relaxed text-ink-mute">
          Running and Completed are labels only: creating an experiment never launches a job.
        </p>
      </div>
    </Modal>
  );
}
