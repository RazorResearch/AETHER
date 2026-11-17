import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Info,
  Layers,
  Play,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, ProvenanceBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { RangeField, SelectInput, Toggle } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { InfoHint } from '@/components/ui/Tooltip';
import { useAppStore } from '@/store/useAppStore';
import { optimizationStrategies, optimizationTargets } from '@/data/demo';
import { toast } from '@/store/useToastStore';
import type { OptimizationStrategyId, OptimizationTargetId } from '@/types';
import { cn } from '@/utils/cn';
import { formatGigabytes, formatNumber } from '@/utils/format';

const RECOMMENDED: OptimizationStrategyId[] = [
  'adaptive-quantization',
  'kv-cache-optimization',
  'layer-wise-precision',
];

/**
 * Optimization configuration workspace.
 *
 * No engine call is made anywhere on this page: the draft is persisted
 * locally, and "Start optimization" reports the missing engine explicitly.
 */
export function OptimizationPage() {
  const models = useAppStore((state) => state.models);
  const draft = useAppStore((state) => state.optimizationDraft);
  const updateDraft = useAppStore((state) => state.updateOptimizationDraft);
  const logActivity = useAppStore((state) => state.logActivity);
  const unit = useAppStore((state) => state.settings.unit);

  const [engineDialog, setEngineDialog] = useState(false);

  const model = models.find((item) => item.id === draft.modelId) ?? null;
  const target = optimizationTargets.find((item) => item.id === draft.target) ?? optimizationTargets[1];

  const selectedStrategies = useMemo(
    () => optimizationStrategies.filter((strategy) => draft.strategyIds.includes(strategy.id)),
    [draft.strategyIds],
  );

  const toggleStrategy = (id: OptimizationStrategyId) => {
    const next = draft.strategyIds.includes(id)
      ? draft.strategyIds.filter((item) => item !== id)
      : [...draft.strategyIds, id];
    updateDraft({ strategyIds: next });
  };

  const canStart = Boolean(model) && selectedStrategies.length > 0;

  const handleStart = () => {
    if (!canStart || !model) return;
    setEngineDialog(true);
    logActivity({
      category: 'Optimization',
      type: 'optimization.requested',
      description: `Optimization requested for ${model.name} — engine unavailable, no run scheduled.`,
      status: 'Warning',
    });
    toast.warning(
      'Engine unavailable',
      'Configuration validated locally. No optimization was executed.',
    );
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Optimization"
        subtitle="Compose an optimization profile. Execution requires the AETHER engine."
        code="workspace / optimization"
        meta={<ProvenanceBadge kind="demo" />}
        actions={
          <>
            <Badge tone="warn" dot>
              engine unavailable
            </Badge>
            <Button
              variant="outline"
              icon={<Sparkles />}
              onClick={() => updateDraft({ strategyIds: RECOMMENDED })}
            >
              Recommended set
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-8">
          {/* ---------------------------- model ---------------------------- */}
          <Card>
            <CardHeader
              kicker="step 01 · model"
              title="Target model"
              hint="Only registered models can be optimized."
              action={
                <Link
                  to="/models"
                  className="focus-ring inline-flex items-center gap-1 rounded font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-mute hover:text-accent"
                >
                  manage library
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              }
            />
            <CardBody>
              {models.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Layers />}
                  title="No model registered"
                  description="The optimizer needs at least one local model record before a profile can be composed."
                  action={
                    <Link
                      to="/models"
                      className="focus-ring inline-flex h-8 items-center rounded-md bg-accent px-3 text-[12px] font-semibold text-[#041016]"
                    >
                      Open library
                    </Link>
                  }
                />
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <SelectInput
                    label="Model"
                    value={draft.modelId ?? ''}
                    onChange={(event) => updateDraft({ modelId: event.target.value || null })}
                    wrapperClassName="flex-1"
                  >
                    {models.map((item) => (
                      <option key={item.id} value={item.id} disabled={item.status === 'Unavailable'}>
                        {item.name} — {item.quantization}
                        {item.status === 'Unavailable' ? ' (files missing)' : ''}
                      </option>
                    ))}
                  </SelectInput>
                  {model && (
                    <div className="flex flex-wrap items-center gap-1.5 pb-1.5">
                      <Badge tone="muted" mono>
                        {model.format}
                      </Badge>
                      <Badge tone="muted" mono>
                        {model.quantization}
                      </Badge>
                      <Badge tone="muted">{model.parameters}</Badge>
                      <Badge tone="muted">
                        {formatGigabytes(model.sizeBytes / 1024 ** 3, unit)}
                      </Badge>
                    </div>
                  )}
                </div>
              )}

              {model && (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line/40 pt-3 sm:grid-cols-4">
                  {[
                    ['Publisher', model.publisher],
                    ['Context', `${formatNumber(model.contextWindow / 1024, 0)}K tokens`],
                    ['Status', model.status],
                    ['Precision', model.quantization],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-ink-mute/80">
                        {label}
                      </div>
                      <div className="mt-1 truncate text-[11.5px] text-ink-dim">{value}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* -------------------------- strategies ------------------------- */}
          <Card>
            <CardHeader
              kicker="step 02 · strategies"
              title={
                <span className="flex items-center gap-2">
                  Optimization strategies
                  <span className="readout text-[11px] font-normal text-ink-mute">
                    {selectedStrategies.length}/{optimizationStrategies.length}
                  </span>
                </span>
              }
              hint="Capabilities the engine would evaluate. None of them execute in this build."
              action={
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => updateDraft({ strategyIds: RECOMMENDED })}
                  >
                    Recommended
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => updateDraft({ strategyIds: [] })}>
                    Clear
                  </Button>
                </div>
              }
            />
            <div>
              {optimizationStrategies.map((strategy) => {
                const active = draft.strategyIds.includes(strategy.id);
                return (
                  <div
                    key={strategy.id}
                    onClick={() => toggleStrategy(strategy.id)}
                    className={cn(
                      'group flex cursor-pointer items-start gap-3 border-b border-line/40 px-5 py-3 transition-colors last:border-0',
                      active ? 'bg-accent/[0.035]' : 'hover:bg-surface2/30',
                    )}
                  >
                    <button
                      type="button"
                      role="switch"
                      aria-checked={active}
                      aria-label={`Toggle ${strategy.label}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleStrategy(strategy.id);
                      }}
                      className={cn(
                        'focus-ring mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[3px] border transition-colors',
                        active
                          ? 'border-accent/70 bg-accent text-[#041016]'
                          : 'border-line bg-base/60 text-transparent group-hover:border-ink-mute/50',
                      )}
                    >
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          className={cn(
                            'text-[12.5px] font-medium',
                            active ? 'text-ink' : 'text-ink-dim',
                          )}
                        >
                          {strategy.label}
                        </span>
                        <span className="rounded border border-line/70 px-1 py-[1px] font-mono text-[8.5px] uppercase tracking-[0.08em] text-ink-mute">
                          {strategy.code}
                        </span>
                        <Badge tone={strategy.maturity === 'Preview' ? 'accent' : 'muted'}>
                          {strategy.maturity}
                        </Badge>
                        <span onClick={(event) => event.stopPropagation()} className="flex">
                          <InfoHint content={strategy.detail} showIcon />
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-ink-mute">
                        {strategy.description}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {strategy.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-sm bg-surface2/60 px-1.5 py-[2px] font-mono text-[8.5px] uppercase tracking-[0.08em] text-ink-mute/80"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* ---------------------------- sidebar --------------------------- */}
        <div className="space-y-3 xl:col-span-4">
          <Card>
            <CardHeader kicker="step 03 · objective" title="Optimization target" />
            <CardBody className="space-y-2">
              {optimizationTargets.map((option) => {
                const active = option.id === draft.target;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => updateDraft({ target: option.id as OptimizationTargetId })}
                    className={cn(
                      'focus-ring w-full rounded-md border px-3 py-2.5 text-left transition-colors',
                      active
                        ? 'border-accent/45 bg-accent/[0.05]'
                        : 'border-line/70 bg-raised/30 hover:border-ink-mute/40',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'flex h-3 w-3 items-center justify-center rounded-full border',
                          active ? 'border-accent' : 'border-ink-mute/60',
                        )}
                      >
                        {active && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                      </span>
                      <span
                        className={cn(
                          'text-[12px] font-medium',
                          active ? 'text-ink' : 'text-ink-dim',
                        )}
                      >
                        {option.label}
                      </span>
                    </div>
                    <p className="mt-1 pl-5 text-[10.5px] leading-relaxed text-ink-mute">
                      {option.description}
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-1.5 pl-5">
                      {[
                        ['INT', option.weights.intelligence],
                        ['SPD', option.weights.speed],
                        ['MEM', option.weights.memory],
                      ].map(([label, weight]) => (
                        <div key={String(label)}>
                          <div className="flex justify-between font-mono text-[8px] text-ink-mute/80">
                            <span>{label}</span>
                            <span>{Math.round(Number(weight) * 100)}</span>
                          </div>
                          <ProgressBar
                            value={Number(weight) * 100}
                            className="mt-1"
                            tone={active ? 'accent' : 'glacier'}
                          />
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}

              <div className="mt-1 flex items-center justify-between rounded-md border border-line/60 bg-raised/20 px-3 py-2.5">
                <div>
                  <div className="text-[11.5px] font-medium text-ink">Advanced mode</div>
                  <div className="mt-0.5 text-[10px] text-ink-mute">
                    Expose bit-width, cache and offload controls.
                  </div>
                </div>
                <Toggle
                  checked={draft.advancedMode}
                  onChange={(checked) => updateDraft({ advancedMode: checked })}
                />
              </div>

              {draft.advancedMode && (
                <div className="space-y-3 rounded-md border border-line/60 bg-raised/20 px-3 py-3">
                  <RangeField
                    label="Quantization bit-width"
                    value={draft.advanced.quantizationBits}
                    min={2}
                    max={8}
                    step={2}
                    unit="bit"
                    onChange={(value) =>
                      updateDraft({ advanced: { ...draft.advanced, quantizationBits: value } })
                    }
                  />
                  <SelectInput
                    label="KV cache precision"
                    value={draft.advanced.kvCachePrecision}
                    onChange={(event) =>
                      updateDraft({
                        advanced: {
                          ...draft.advanced,
                          kvCachePrecision: event.target.value as 'f16' | 'q8' | 'q4',
                        },
                      })
                    }
                  >
                    <option value="f16">f16 · reference</option>
                    <option value="q8">q8 · balanced</option>
                    <option value="q4">q4 · aggressive</option>
                  </SelectInput>
                  <RangeField
                    label="Offloaded layers"
                    value={draft.advanced.offloadLayers}
                    min={0}
                    max={32}
                    step={1}
                    unit="layers"
                    onChange={(value) =>
                      updateDraft({ advanced: { ...draft.advanced, offloadLayers: value } })
                    }
                  />
                  <RangeField
                    label="Pruning ratio"
                    value={Math.round(draft.advanced.pruningRatio * 100)}
                    min={0}
                    max={50}
                    step={5}
                    unit="%"
                    onChange={(value) =>
                      updateDraft({ advanced: { ...draft.advanced, pruningRatio: value / 100 } })
                    }
                  />
                  <RangeField
                    label="Speculative draft tokens"
                    value={draft.advanced.speculativeDraftTokens}
                    min={0}
                    max={8}
                    step={1}
                    unit="tok"
                    onChange={(value) =>
                      updateDraft({
                        advanced: { ...draft.advanced, speculativeDraftTokens: value },
                      })
                    }
                  />
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader kicker="step 04 · constraints" title="Resource constraints" />
            <CardBody className="space-y-3.5">
              <RangeField
                label="Maximum VRAM"
                value={draft.constraints.maxVramGb}
                min={2}
                max={48}
                step={0.5}
                unit={unit}
                description="Hard ceiling the placement solver must respect."
                onChange={(value) =>
                  updateDraft({ constraints: { ...draft.constraints, maxVramGb: value } })
                }
              />
              <RangeField
                label="Maximum RAM"
                value={draft.constraints.maxRamGb}
                min={4}
                max={128}
                step={1}
                unit={unit}
                onChange={(value) =>
                  updateDraft({ constraints: { ...draft.constraints, maxRamGb: value } })
                }
              />
              <RangeField
                label="Context length"
                value={draft.constraints.contextLength}
                min={1024}
                max={131072}
                step={1024}
                unit="tok"
                onChange={(value) =>
                  updateDraft({ constraints: { ...draft.constraints, contextLength: value } })
                }
              />
              <RangeField
                label="Target generation speed"
                value={draft.constraints.targetTokensPerSecond}
                min={5}
                max={150}
                step={1}
                unit="tok/s"
                onChange={(value) =>
                  updateDraft({
                    constraints: { ...draft.constraints, targetTokensPerSecond: value },
                  })
                }
              />
            </CardBody>
          </Card>

          {/* ---------------------------- summary --------------------------- */}
          <Card className="xl:sticky xl:top-[70px]">
            <CardHeader
              kicker="expected result"
              title="Configuration summary"
              action={<SlidersHorizontal className="h-3.5 w-3.5 text-ink-mute/60" />}
            />
            <CardBody className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
                    model
                  </span>
                  <span className="truncate text-[11.5px] text-ink-dim">
                    {model?.name ?? 'none selected'}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
                    objective
                  </span>
                  <span className="truncate text-[11.5px] text-ink-dim">{target.label}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
                    strategies
                  </span>
                  <span className="readout text-[11.5px] text-ink-dim">
                    {selectedStrategies.length}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {selectedStrategies.length === 0 ? (
                  <span className="text-[10.5px] text-warn/90">
                    Select at least one strategy to build a profile.
                  </span>
                ) : (
                  selectedStrategies.map((strategy) => (
                    <span
                      key={strategy.id}
                      className="rounded border border-accent/20 bg-accent/[0.05] px-1.5 py-[2px] font-mono text-[8.5px] uppercase tracking-[0.08em] text-accent/90"
                      title={strategy.label}
                    >
                      {strategy.code}
                    </span>
                  ))
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-line/50 pt-3">
                {[
                  ['VRAM cap', `${formatNumber(draft.constraints.maxVramGb, 1)} ${unit}`],
                  ['RAM cap', `${formatNumber(draft.constraints.maxRamGb, 0)} ${unit}`],
                  [
                    'Context',
                    `${formatNumber(draft.constraints.contextLength / 1024, 0)}K tok`,
                  ],
                  ['Target', `${draft.constraints.targetTokensPerSecond} tok/s`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-ink-mute/80">
                      {label}
                    </div>
                    <div className="readout mt-0.5 text-[11px] text-ink-dim">{value}</div>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2 rounded border border-warn/25 bg-warn/[0.05] px-2.5 py-2">
                <Info className="mt-0.5 h-3 w-3 shrink-0 text-warn" />
                <p className="text-[10.5px] leading-relaxed text-ink-dim">
                  No profile will be computed. The optimization engine is not bundled with this
                  build — the configuration is stored locally for the future engine.
                </p>
              </div>

              <Button
                variant="primary"
                className="w-full"
                icon={<Play />}
                disabled={!canStart}
                onClick={handleStart}
              >
                Start optimization
              </Button>
              <p className="text-center font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute/60">
                engine unavailable · configuration saved
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal
        open={engineDialog}
        onClose={() => setEngineDialog(false)}
        title="Optimization engine unavailable"
        kicker="engine · not implemented"
        description="AETHER 0.1 ships the research workspace only. Your configuration is valid and stored locally, but nothing is executed."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEngineDialog(false)}>
              Understood
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-md border border-line/70 bg-raised/40 px-3 py-2.5">
            <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
              submitted configuration
            </div>
            <div className="mt-1.5 text-[11.5px] text-ink-dim">
              {model?.name} · {target.label} · {selectedStrategies.length} strategies ·{' '}
              {draft.constraints.maxVramGb} {unit} VRAM cap
            </div>
          </div>

          <div className="space-y-1.5">
            {[
              ['01', 'Sensitivity analysis', 'per-layer activation statistics'],
              ['02', 'Strategy search', 'multi-objective profile candidates'],
              ['03', 'Constraint solve', 'layer placement under VRAM/RAM budget'],
              ['04', 'Local evaluation', 'perplexity and throughput probes'],
              ['05', 'Profile emission', 'engine profile handed to the runtime'],
            ].map(([step, label, detail]) => (
              <div
                key={step}
                className="flex items-center gap-3 rounded border border-line/50 px-2.5 py-2"
              >
                <span className="font-mono text-[9px] text-ink-mute/70">{step}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11.5px] text-ink-dim">{label}</div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-mute/70">
                    {detail}
                  </div>
                </div>
                <Badge tone="muted" mono>
                  missing
                </Badge>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2 rounded border border-line/60 bg-raised/30 px-2.5 py-2">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-ink-mute" />
            <p className="text-[10.5px] leading-relaxed text-ink-mute">
              No benchmark numbers have been produced for this request. AETHER will never fabricate
              optimization results.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
