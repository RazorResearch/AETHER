import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Cpu, Loader2, Power, PowerOff } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { chatApi, type RuntimeConfig, type RuntimeState } from '@/api/chat';
import { errorMessage } from '@/api/client';
import { formatContext, formatParams } from '@/api/adapters';
import { useAppStore } from '@/store/useAppStore';
import { useChatStore } from '@/store/useChatStore';
import { toast } from '@/store/useToastStore';
import { cn } from '@/utils/cn';
import { formatBytes } from '@/utils/format';

export const sameRuntime = (a: RuntimeConfig, b: RuntimeConfig) =>
  (Object.keys(b) as (keyof RuntimeConfig)[]).every((k) => (a[k] ?? null) === (b[k] ?? null));

export const stateTone: Record<RuntimeState, BadgeTone> = {
  unloaded: 'muted',
  loading: 'warn',
  ready: 'ok',
  unloading: 'warn',
  error: 'danger',
};

export function ModelSelector() {
  const models = useChatStore((s) => s.models);
  const modelId = useChatStore((s) => s.modelId);
  const runtime = useChatStore((s) => s.runtime);
  const status = useChatStore((s) => s.runtimeStatus);
  const phase = useChatStore((s) => s.phase);
  const set = useChatStore((s) => s.set);
  const refreshModels = useChatStore((s) => s.refreshModels);
  const unit = useAppStore((s) => s.settings.unit);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'load' | 'unload' | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const current = models.find((m) => m.id === modelId);
  const resident = status?.model_id === modelId;
  const state: RuntimeState = resident ? status!.state : 'unloaded';
  const configDiffers =
    resident && status?.state === 'ready' && status.config != null && !sameRuntime(status.config, runtime);

  const load = async () => {
    if (!modelId) return;
    setBusy('load');
    try {
      await chatApi.load(modelId, runtime);
    } catch (e) {
      toast.error('Model failed to load', errorMessage(e));
    } finally {
      setBusy(null);
      void refreshModels();
    }
  };
  const unload = async () => {
    setBusy('unload');
    try {
      await chatApi.unload();
    } catch (e) {
      toast.error('Unload failed', errorMessage(e));
    } finally {
      setBusy(null);
      void refreshModels();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={phase !== 'idle'}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="focus-ring flex h-8 min-w-[260px] max-w-[420px] items-center gap-2 rounded-md border border-line bg-raised px-2.5 text-left disabled:opacity-60"
        >
          <Cpu className="h-3.5 w-3.5 shrink-0 text-ink-mute" />
          <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{current?.name ?? 'Select a model'}</span>
          {current?.quantization && <span className="font-mono text-[11.5px] text-ink-mute">{current.quantization}</span>}
          <ChevronDown className="h-3.5 w-3.5 text-ink-mute" />
        </button>
        {open && (
          <ul
            role="listbox"
            className="absolute left-0 top-9 z-40 max-h-[380px] w-[480px] overflow-y-auto rounded-md border border-line bg-raised p-1 shadow-xl shadow-black/30"
          >
            {models.length === 0 && <li className="px-3 py-2 text-[13px] text-ink-mute">No model registered. Import one in Models.</li>}
            {models.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={m.id === modelId}
                  disabled={!m.loadable}
                  onClick={() => {
                    set({ modelId: m.id, profileId: null });
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-sm px-2.5 py-2 text-left',
                    m.loadable ? 'hover:bg-surface2/60' : 'cursor-not-allowed opacity-50',
                  )}
                >
                  <span className="mt-0.5 w-3.5">{m.id === modelId && <Check className="h-3.5 w-3.5 text-accent" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] text-ink">{m.name}</span>
                      <Badge tone={stateTone[m.state]} dot>
                        {m.state}
                      </Badge>
                    </span>
                    <span className="block font-mono text-[11.5px] text-ink-mute">
                      {[m.architecture ?? 'arch ?', m.format.toUpperCase(), m.quantization ?? '—', formatParams(m.n_params),
                        formatBytes(m.file_size_bytes, unit), `ctx ${formatContext(m.context_length)}`, m.backend].join(' · ')}
                    </span>
                    {m.unavailable_reason && <span className="block text-[12px] text-warn">{m.unavailable_reason}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Badge tone={stateTone[state]} dot>
        {state === 'ready' && status?.load_time_s != null ? `ready · loaded in ${status.load_time_s}s` : state}
      </Badge>
      {configDiffers && <Badge tone="warn">runtime changed · reload on next message</Badge>}
      {status?.state === 'error' && resident && <span className="text-[12px] text-danger">{status.error}</span>}

      {resident && (state === 'ready' || state === 'error') ? (
        <button
          type="button"
          onClick={() => void unload()}
          disabled={phase !== 'idle' || busy !== null}
          className="focus-ring inline-flex h-7 items-center gap-1 rounded-sm border border-line px-2 text-[12.5px] text-ink-mute hover:text-ink disabled:opacity-50"
          title="Unload the model and free VRAM"
        >
          {busy === 'unload' ? <Loader2 className="h-3 w-3 animate-spin" /> : <PowerOff className="h-3 w-3" />} Unload
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void load()}
          disabled={!current?.loadable || phase !== 'idle' || busy !== null}
          className="focus-ring inline-flex h-7 items-center gap-1 rounded-sm border border-line px-2 text-[12.5px] text-ink-mute hover:text-ink disabled:opacity-50"
          title="Load now with the current runtime settings (otherwise loaded on first message)"
        >
          {busy === 'load' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />} Load
        </button>
      )}
    </div>
  );
}
