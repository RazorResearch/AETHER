import { useEffect, useMemo, useState } from 'react';
import { Copy, Pencil, Save, Sparkles, Trash2, X } from 'lucide-react';
import { Badge, ProvenanceBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { chatApi, DEFAULT_SAMPLING, type PresetsResponse, type RuntimeConfig } from '@/api/chat';
import { errorMessage } from '@/api/client';
import { useAppStore } from '@/store/useAppStore';
import { useChatStore } from '@/store/useChatStore';
import { toast } from '@/store/useToastStore';
import { cn } from '@/utils/cn';
import { bytes } from './fmt';

/** Validation against the selected model and the llama.cpp backend. Returns field -> message. */
export function validateConfig(
  rt: RuntimeConfig,
  ctxMax: number | null,
  nLayers: number | null,
  maxThreads: number | null,
  kvTypes: string[],
): Record<string, string> {
  const e: Record<string, string> = {};
  if (rt.n_ctx < 256) e.n_ctx = 'Minimum 256 tokens.';
  if (ctxMax && rt.n_ctx > ctxMax) e.n_ctx = `Model was trained for ${ctxMax} tokens.`;
  if (rt.n_gpu_layers < 0) e.n_gpu_layers = 'Must be ≥ 0.';
  if (nLayers != null && rt.n_gpu_layers > nLayers + 1 && rt.n_gpu_layers !== 99) e.n_gpu_layers = `Model has ${nLayers} layers (+ output). Use ${nLayers + 1} or 99 for all.`;
  if (rt.n_threads != null && maxThreads && (rt.n_threads < 1 || rt.n_threads > maxThreads)) e.n_threads = `1 – ${maxThreads} on this CPU.`;
  if (rt.n_ubatch > rt.n_batch) e.n_ubatch = 'Must be ≤ batch size.';
  if (!kvTypes.includes(rt.cache_type_k)) e.cache_type_k = 'Unsupported by llama.cpp.';
  if (!kvTypes.includes(rt.cache_type_v)) e.cache_type_v = 'Unsupported by llama.cpp.';
  if (!['f16', 'f32', 'bf16'].includes(rt.cache_type_v) && rt.flash_attn === 'off') e.cache_type_v = 'A quantized V cache needs flash attention (on/auto).';
  return e;
}

function Num({
  label, value, onChange, step = 1, min, max, hint, error, nullable,
}: {
  label: string; value: number | null; onChange: (v: number | null) => void; step?: number; min?: number; max?: number;
  hint?: string; error?: string; nullable?: boolean;
}) {
  return (
    <div>
      <TextInput
        label={label}
        hint={hint}
        type="number"
        step={step}
        min={min}
        max={max}
        value={value ?? ''}
        placeholder={nullable ? 'auto' : undefined}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '') onChange(nullable ? null : min ?? 0);
          else onChange(Number(v));
        }}
        className={error ? 'border-danger/60' : undefined}
      />
      {error && <p className="mt-1 text-[12px] text-danger">{error}</p>}
    </div>
  );
}

function Section({ title, kind, children }: { title: string; kind: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line/60 pt-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[13.5px] font-medium text-ink">{title}</h3>
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-mute/70">{kind}</span>
      </div>
      {children}
    </section>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const st = useChatStore();
  const unit = useAppStore((s) => s.settings.unit);
  const model = st.models.find((m) => m.id === st.modelId) ?? null;
  const backend = st.backend;
  const kvTypes = backend?.kv_cache_types ?? ['f16', 'q8_0', 'q4_0'];
  const errors = useMemo(
    () => validateConfig(st.runtime, model?.context_length ?? null, model?.n_layers ?? null, backend?.max_threads ?? null, kvTypes),
    [st.runtime, model, backend, kvTypes],
  );
  const [presets, setPresets] = useState<PresetsResponse | null>(null);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const placement = st.runtimeStatus?.model_id === st.modelId ? st.runtimeStatus?.placement : null;

  useEffect(() => {
    void st.refreshProfiles();
    if (!st.modelId) return;
    chatApi.presets(st.modelId).then(setPresets).catch(() => setPresets(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.modelId]);

  const saveProfile = async () => {
    if (!newName.trim()) return;
    try {
      const p = await chatApi.createProfile({ name: newName.trim(), model_id: st.modelId, generation: st.generation, runtime: st.runtime });
      st.set({ profileId: p.id });
      setNewName('');
      await st.refreshProfiles();
      toast.success('Profile saved', p.name);
    } catch (e) {
      toast.error('Could not save profile', errorMessage(e));
    }
  };

  const action = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      await st.refreshProfiles();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error('Profile action failed', errorMessage(e));
    }
  };

  const g = st.generation;
  const r = st.runtime;

  return (
    <aside className="flex h-full w-full flex-col border-l border-line/60 bg-raised" aria-label="Generation settings">
      <div className="flex items-center justify-between border-b border-line/60 px-4 py-2.5">
        <div>
          <div className="text-[14px] font-medium text-ink">Configuration</div>
          <div className="font-mono text-[11.5px] text-ink-mute">{backend ? `${backend.name} ${backend.version ?? ''}` : 'backend unknown'}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close settings">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {/* ------------------------------ profiles ------------------------------ */}
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-[13.5px] font-medium text-ink">Profiles</h3>
            {st.profileId ? <Badge tone="accent">{st.profiles.find((p) => p.id === st.profileId)?.name ?? 'profile'}</Badge> : <Badge tone="muted">unsaved settings</Badge>}
          </div>
          {presets && (
            <div className="mb-2">
              <div className="mb-1 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-mute">
                <Sparkles className="h-3 w-3" /> presets for this model & machine <ProvenanceBadge kind="estimated" />
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {presets.presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!p.available || !p.runtime}
                    onClick={() => p.runtime && st.set({ runtime: p.runtime, generation: p.generation ?? DEFAULT_SAMPLING, profileId: null })}
                    title={p.rationale ?? p.reason ?? ''}
                    className="focus-ring rounded border border-line/70 px-2.5 py-1.5 text-left hover:border-accent/40 disabled:opacity-40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] text-ink">{p.name}</span>
                      {p.runtime && (
                        <span className="font-mono text-[11px] text-ink-mute">
                          ctx {p.runtime.n_ctx} · KV {p.runtime.cache_type_k}/{p.runtime.cache_type_v} · ngl {p.runtime.n_gpu_layers}
                        </span>
                      )}
                    </div>
                    {p.estimate && (
                      <div className="font-mono text-[11px] text-ink-mute/80">
                        est. VRAM {bytes(p.estimate.vram_bytes, unit)} · RAM {bytes(p.estimate.ram_bytes, unit)} · OOM risk {p.estimate.oom_risk}
                      </div>
                    )}
                    {!p.available && <div className="text-[11.5px] text-warn">{p.reason}</div>}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11.5px] text-ink-mute">{presets.note}</p>
            </div>
          )}

          <ul className="space-y-1">
            {st.profiles.map((p) => (
              <li key={p.id} className={cn('flex items-center gap-1 rounded border px-2 py-1', p.id === st.profileId ? 'border-accent/45' : 'border-line/60')}>
                {renaming === p.id ? (
                  <input
                    autoFocus
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void action(() => chatApi.updateProfile(p.id, { name: renameText }).then(() => setRenaming(null)));
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none"
                    aria-label="Profile name"
                  />
                ) : (
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      if (p.model_id) st.set({ modelId: p.model_id });
                      st.set({ generation: p.generation, runtime: p.runtime, profileId: p.id });
                    }}
                    title="Apply this profile"
                  >
                    <div className="truncate text-[13px] text-ink">{p.name}</div>
                    <div className="truncate font-mono text-[11px] text-ink-mute">
                      {p.model?.name ?? 'any model'} {p.model?.quantization ?? ''} · ctx {p.runtime.n_ctx} · KV {p.runtime.cache_type_k}/{p.runtime.cache_type_v}
                    </div>
                  </button>
                )}
                {p.id === st.profileId && (
                  <button type="button" title="Overwrite with current settings" aria-label="Update profile" className="p-1 text-ink-mute hover:text-ink"
                    onClick={() => void action(() => chatApi.updateProfile(p.id, { generation: st.generation, runtime: st.runtime }), 'Profile updated')}>
                    <Save className="h-3 w-3" />
                  </button>
                )}
                <button type="button" title="Rename" aria-label="Rename profile" className="p-1 text-ink-mute hover:text-ink" onClick={() => { setRenaming(p.id); setRenameText(p.name); }}>
                  <Pencil className="h-3 w-3" />
                </button>
                <button type="button" title="Duplicate" aria-label="Duplicate profile" className="p-1 text-ink-mute hover:text-ink" onClick={() => void action(() => chatApi.duplicateProfile(p.id))}>
                  <Copy className="h-3 w-3" />
                </button>
                <button type="button" title="Delete" aria-label="Delete profile" className="p-1 text-ink-mute hover:text-danger"
                  onClick={() => void action(() => chatApi.deleteProfile(p.id).then(() => p.id === st.profileId && st.set({ profileId: null })))}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-1.5">
            <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Save current settings as…" wrapperClassName="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && void saveProfile()} aria-label="New profile name" />
            <Button variant="secondary" icon={<Save />} onClick={() => void saveProfile()} disabled={!newName.trim() || Object.keys(errors).length > 0}>
              Save
            </Button>
          </div>
        </section>

        {/* ------------------------------ generation ---------------------------- */}
        <Section title="Generation parameters" kind="per request · no reload">
          <div className="grid grid-cols-2 gap-2.5">
            <Num label="Temperature" step={0.05} min={0} max={5} value={g.temperature} onChange={(v) => st.setGeneration({ temperature: v ?? 0 })} />
            <Num label="Top P" step={0.01} min={0} max={1} value={g.top_p} onChange={(v) => st.setGeneration({ top_p: v ?? 1 })} />
            <Num label="Top K" min={0} max={1000} value={g.top_k} onChange={(v) => st.setGeneration({ top_k: v ?? 0 })} hint="0 = off" />
            <Num label="Min P" step={0.01} min={0} max={1} value={g.min_p} onChange={(v) => st.setGeneration({ min_p: v ?? 0 })} />
            <Num label="Repetition penalty" step={0.05} min={0.5} max={2.5} value={g.repeat_penalty} onChange={(v) => st.setGeneration({ repeat_penalty: v ?? 1 })} />
            <Num label="Max tokens" min={1} max={131072} value={g.max_tokens} onChange={(v) => st.setGeneration({ max_tokens: v ?? 1 })} />
            <Num label="Seed" nullable min={0} value={g.seed} onChange={(v) => st.setGeneration({ seed: v })} hint="empty = random" />
          </div>
          <TextArea label="System prompt" rows={2} value={st.systemPrompt} onChange={(e) => st.set({ systemPrompt: e.target.value })}
            hint="applied to new conversations" wrapperClassName="mt-2.5" />
        </Section>

        {/* ------------------------------- runtime ------------------------------ */}
        <Section title="Runtime parameters" kind="load time · reloads the model">
          <div className="grid grid-cols-2 gap-2.5">
            <Num label="Context length" step={256} min={256} max={model?.context_length ?? undefined} value={r.n_ctx}
              onChange={(v) => st.setRuntime({ n_ctx: v ?? 4096 })} hint={model?.context_length ? `max ${model.context_length}` : undefined} error={errors.n_ctx} />
            <Num label="CPU threads" nullable min={1} max={backend?.max_threads ?? undefined} value={r.n_threads}
              onChange={(v) => st.setRuntime({ n_threads: v })} hint={backend?.max_threads ? `auto · ≤ ${backend.max_threads}` : 'auto'} error={errors.n_threads} />
            <Num label="Batch size" step={64} min={32} value={r.n_batch} onChange={(v) => st.setRuntime({ n_batch: v ?? 2048 })} />
            <Num label="Micro-batch size" step={64} min={32} value={r.n_ubatch} onChange={(v) => st.setRuntime({ n_ubatch: v ?? 512 })} error={errors.n_ubatch} />
          </div>
        </Section>

        {/* ------------------------------- hardware ----------------------------- */}
        <Section title="Hardware placement" kind="gpu / cpu split">
          <Num label="GPU layers (-ngl)" min={0} max={999} value={r.n_gpu_layers} onChange={(v) => st.setRuntime({ n_gpu_layers: v ?? 0 })}
            hint={model?.n_layers ? `${model.n_layers} layers + output · 99 = all · 0 = CPU only` : '99 = all'} error={errors.n_gpu_layers} />
          <div className="mt-2 rounded border border-line/60 px-2.5 py-2 text-[12.5px] text-ink-dim">
            {placement?.layers_on_gpu != null ? (
              <>
                <div className="flex items-center gap-2">
                  <ProvenanceBadge kind="measured" /> {placement.layers_on_gpu}/{placement.layers_total} layers on GPU (llama.cpp load log)
                </div>
                <div className="mt-1 font-mono text-[11.5px] text-ink-mute">
                  {Object.entries(placement.buffers_mib).map(([dev, b]) => `${dev}: ${Object.entries(b).map(([k, v]) => `${k} ${v} MiB`).join(', ')}`).join(' · ')}
                </div>
              </>
            ) : (
              <span className="text-ink-mute">Measured placement appears once the model is loaded.</span>
            )}
          </div>
        </Section>

        {/* ----------------------------- optimization --------------------------- */}
        <Section title="Optimization settings" kind="memory / speed trade-offs">
          <div className="grid grid-cols-2 gap-2.5">
            <SelectInput label="KV cache K" value={r.cache_type_k} onChange={(e) => st.setRuntime({ cache_type_k: e.target.value })}>
              {kvTypes.map((k) => <option key={k}>{k}</option>)}
            </SelectInput>
            <div>
              <SelectInput label="KV cache V" value={r.cache_type_v} onChange={(e) => st.setRuntime({ cache_type_v: e.target.value })}>
                {kvTypes.map((k) => <option key={k}>{k}</option>)}
              </SelectInput>
              {errors.cache_type_v && <p className="mt-1 text-[12px] text-danger">{errors.cache_type_v}</p>}
            </div>
            <SelectInput label="Flash attention" value={r.flash_attn} onChange={(e) => st.setRuntime({ flash_attn: e.target.value as RuntimeConfig['flash_attn'] })}>
              {(backend?.flash_attn_modes ?? ['auto', 'on', 'off']).map((m) => <option key={m}>{m}</option>)}
            </SelectInput>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-mute">
            Quantized KV caches reduce memory; their effect on answer quality is model-dependent and is not measured here.
            Use Compare Configurations to measure speed and memory.
          </p>
        </Section>
      </div>
    </aside>
  );
}
