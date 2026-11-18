import { useEffect, useState } from 'react';
import { Activity, FlaskConical, MessageSquare, PanelRightOpen, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Field';
import { EngineOffline } from '@/components/engine/EngineOffline';
import { SessionList } from '@/components/chat/SessionList';
import { MessageList } from '@/components/chat/MessageList';
import { Composer } from '@/components/chat/Composer';
import { ModelSelector } from '@/components/chat/ModelSelector';
import { SettingsPanel, validateConfig } from '@/components/chat/SettingsPanel';
import { MetricsPanel } from '@/components/chat/MetricsPanel';
import { CompareLab } from '@/components/chat/CompareLab';
import { useChatStore } from '@/store/useChatStore';
import { useEngineStore } from '@/store/useEngineStore';
import { cn } from '@/utils/cn';

type View = 'chat' | 'compare';

/**
 * Local chat on llama.cpp with live inference monitoring.
 * The page fills the viewport below the top bar (no page scroll).
 */
export function ChatPage() {
  const connection = useEngineStore((s) => s.connection);
  const st = useChatStore();
  const [view, setView] = useState<View>('chat');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const online = connection === 'online';

  useEffect(() => {
    if (!online) return;
    void st.refreshModels();
    void st.refreshSessions();
    void st.refreshProfiles();
    if (st.activeId && st.phase === 'idle') void st.openSession(st.activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // keep runtime state fresh while idle (another tab or a comparison may load/unload models)
  useEffect(() => {
    if (!online) return;
    const id = window.setInterval(() => st.phase === 'idle' && void st.refreshModels(), 4000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, st.phase]);

  const model = st.models.find((m) => m.id === st.modelId);
  const errs = validateConfig(st.runtime, model?.context_length ?? null, model?.n_layers ?? null, st.backend?.max_threads ?? null,
    st.backend?.kv_cache_types ?? ['f16', 'q8_0', 'q4_0']);
  const disabledReason = !online
    ? 'Engine offline'
    : st.backend && !st.backend.available
      ? 'llama-server is not installed on the engine host'
      : !model
        ? 'Select a model to start'
        : Object.keys(errs).length
          ? `Invalid configuration: ${Object.values(errs)[0]}`
          : null;

  return (
    <div className="-mx-4 -my-5 flex h-[calc(100vh-52px)] flex-col lg:-mx-6">
      <div className="flex flex-wrap items-center gap-2 border-b border-line/60 px-4 py-2 lg:px-6">
        <Segmented<View>
          ariaLabel="Chat view"
          value={view}
          onChange={setView}
          options={[
            { value: 'chat', label: <span className="inline-flex items-center gap-1.5"><MessageSquare className="h-3 w-3" />Chat</span> },
            { value: 'compare', label: <span className="inline-flex items-center gap-1.5"><FlaskConical className="h-3 w-3" />Compare configurations</span> },
          ]}
        />
        {view === 'chat' && <ModelSelector />}
        <div className="ml-auto flex items-center gap-1.5">
          {view === 'chat' && st.panel === 'hidden' && (
            <Button variant="ghost" size="sm" icon={<PanelRightOpen />} onClick={() => st.set({ panel: 'compact' })}>
              Metrics
            </Button>
          )}
          {view === 'chat' && (
            <Button variant={settingsOpen ? 'secondary' : 'outline'} size="sm" icon={<Settings2 />} onClick={() => setSettingsOpen((v) => !v)}>
              Configuration
            </Button>
          )}
        </div>
      </div>

      {!online && (
        <div className="px-4 pt-3 lg:px-6">
          <EngineOffline compact />
        </div>
      )}

      {view === 'compare' ? (
        <div className="min-h-0 flex-1">
          <CompareLab />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="hidden w-[230px] shrink-0 border-r border-line/60 md:block">
            <SessionList />
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            {st.messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <Activity className="mb-3 h-6 w-6 text-accent/70" />
                <div className="text-[16px] font-medium text-ink">Local chat · measured inference</div>
                <p className="mt-1.5 max-w-[520px] text-[13.5px] leading-relaxed text-ink-mute">
                  Answers are generated on this machine by llama.cpp. Speed, latency and memory are measured live
                  for every message and stored with it. Nothing leaves the machine.
                </p>
                {model && (
                  <p className="mt-3 font-mono text-[12px] text-ink-mute">
                    {model.name} · {model.quantization} · ctx {st.runtime.n_ctx} · KV {st.runtime.cache_type_k}/{st.runtime.cache_type_v} · ngl {st.runtime.n_gpu_layers}
                  </p>
                )}
              </div>
            ) : (
              <MessageList />
            )}
            {st.error && st.phase === 'idle' && (
              <div className="mx-auto w-full max-w-[860px] px-4">
                <p className="rounded border border-danger/30 bg-danger/[0.05] px-3 py-1.5 text-[12.5px] text-danger">{st.error}</p>
              </div>
            )}
            <Composer disabledReason={disabledReason} />
          </div>

          {settingsOpen && (
            <div className="w-[360px] shrink-0">
              <SettingsPanel onClose={() => setSettingsOpen(false)} />
            </div>
          )}
          {st.panel !== 'hidden' && (
            <div className={cn('shrink-0', st.panel === 'expanded' ? 'w-[420px]' : 'w-[280px]', settingsOpen && 'hidden 2xl:block')}>
              <MetricsPanel />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
