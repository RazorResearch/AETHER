import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ApiError, errorMessage } from '@/api/client';
import {
  chatApi,
  DEFAULT_RUNTIME,
  DEFAULT_SAMPLING,
  streamGenerate,
  type BackendInfo,
  type ChatMessage,
  type ChatModel,
  type ChatProfile,
  type ChatSession,
  type GenerateBody,
  type LiveSnapshot,
  type MessageMetrics,
  type Placement,
  type RuntimeConfig,
  type RuntimeStatus,
  type SamplingParams,
} from '@/api/chat';
import { toast } from '@/store/useToastStore';

export type GenPhase = 'idle' | 'loading' | 'generating' | 'stopping';
export type PanelMode = 'hidden' | 'compact' | 'expanded';

/** One real measurement point received during generation. */
export interface LivePoint {
  t: number; // s since sampler start (engine clock)
  ts: string;
  tps: number | null;
  tokens: number;
  vram: number | null;
  ram: number | null;
  rss: number | null;
  gpu: number | null;
  cpu: number | null;
  temp: number | null;
  power: number | null;
}

interface ChatState {
  /* persisted settings */
  modelId: string | null;
  profileId: string | null;
  generation: SamplingParams;
  runtime: RuntimeConfig;
  systemPrompt: string;
  panel: PanelMode;

  /* engine data */
  models: ChatModel[];
  backend: BackendInfo | null;
  runtimeStatus: RuntimeStatus | null;
  profiles: ChatProfile[];
  sessions: ChatSession[];
  activeId: string | null;
  messages: ChatMessage[];

  /* generation */
  phase: GenPhase;
  generationId: string | null;
  live: LiveSnapshot | null;
  points: LivePoint[];
  placement: Placement | null;
  lastMetrics: MessageMetrics | null;
  error: string | null;
  abort: AbortController | null;

  set: (patch: Partial<ChatState>) => void;
  setGeneration: (p: Partial<SamplingParams>) => void;
  setRuntime: (p: Partial<RuntimeConfig>) => void;
  refreshModels: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
  openSession: (id: string | null) => Promise<void>;
  send: (content: string) => Promise<void>;
  regenerate: () => Promise<void>;
  editAndResend: (messageId: string, content: string) => Promise<void>;
  stop: () => Promise<void>;
}

/* token buffer flushed once per animation frame (keeps markdown rendering smooth) */
let pending = { content: '', reasoning: '' };
let raf: number | null = null;

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => {
      const flush = () => {
        raf = null;
        if (!pending.content && !pending.reasoning) return;
        const { content, reasoning } = pending;
        pending = { content: '', reasoning: '' };
        set((s) => {
          const msgs = s.messages.slice();
          const last = msgs[msgs.length - 1];
          if (last && last.role === 'assistant' && last.status === 'generating') {
            msgs[msgs.length - 1] = {
              ...last,
              content: last.content + content,
              reasoning: reasoning ? (last.reasoning ?? '') + reasoning : last.reasoning,
            };
          }
          return { messages: msgs };
        });
      };
      const schedule = () => {
        if (raf == null) raf = requestAnimationFrame(flush);
      };

      const run = async (body: Omit<GenerateBody, 'generation' | 'runtime' | 'model_id'>, optimistic: ChatMessage[]) => {
        const s = get();
        if (!s.modelId) {
          toast.warning('No model selected', 'Choose a local model first.');
          return;
        }
        if (s.phase !== 'idle') return;
        const abort = new AbortController();
        set({
          phase: 'loading',
          error: null,
          live: null,
          points: [],
          lastMetrics: null,
          abort,
          messages: [
            ...optimistic,
            {
              id: 'pending-assistant',
              session_id: s.activeId ?? '',
              seq: 1e9,
              role: 'assistant',
              content: '',
              reasoning: null,
              status: 'generating',
              metrics: null,
              created_at: new Date().toISOString(),
            },
          ],
        });
        try {
          await streamGenerate(
            {
              ...body,
              model_id: s.modelId,
              session_id: s.activeId,
              system_prompt: s.systemPrompt.trim() || null,
              generation: s.generation,
              runtime: s.runtime,
              profile_id: s.profileId,
            },
            (ev) => {
              switch (ev.type) {
                case 'session':
                  set({ activeId: ev.data.session_id, generationId: ev.data.generation_id });
                  break;
                case 'status':
                  if (ev.data.state === 'loading') set({ phase: 'loading' });
                  if (ev.data.state === 'generating')
                    set({ phase: get().phase === 'stopping' ? 'stopping' : 'generating', placement: ev.data.placement ?? null });
                  void get().refreshModels();
                  break;
                case 'token':
                  pending.content += ev.data.text;
                  schedule();
                  break;
                case 'reasoning':
                  pending.reasoning += ev.data.text;
                  schedule();
                  break;
                case 'metrics': {
                  const d = ev.data;
                  const smp = d.sample;
                  set((st) => ({
                    live: d,
                    points: smp
                      ? [
                          ...st.points,
                          {
                            t: smp.t,
                            ts: smp.ts,
                            tps: d.live_tokens_per_s,
                            tokens: d.streamed_tokens,
                            vram: smp.vram_used,
                            ram: smp.ram_used,
                            rss: smp.proc_rss,
                            gpu: smp.gpu_util,
                            cpu: smp.cpu_util,
                            temp: smp.gpu_temp,
                            power: smp.gpu_power_w,
                          },
                        ].slice(-2400)
                      : st.points,
                  }));
                  break;
                }
                case 'error':
                  set({ error: `${ev.data.code}: ${ev.data.message}` });
                  if (ev.data.code !== 'CANCELLED') toast.error('Generation failed', ev.data.message);
                  break;
                case 'done':
                  flush();
                  set((st) => ({
                    lastMetrics: ev.data.metrics,
                    messages: st.messages.map((m) => (m.id === 'pending-assistant' || m.id === ev.data.message.id ? ev.data.message : m)),
                  }));
                  break;
              }
            },
            abort.signal,
          );
        } catch (e) {
          const msg = errorMessage(e);
          set({ error: msg });
          toast.error(e instanceof ApiError && e.code === 'BUSY' ? 'Engine busy' : 'Generation failed', msg);
        } finally {
          flush();
          set({ phase: 'idle', abort: null, generationId: null });
          const id = get().activeId;
          await Promise.all([get().refreshSessions(), get().refreshModels()]);
          if (id) await get().openSession(id);
        }
      };

      return {
        modelId: null,
        profileId: null,
        generation: DEFAULT_SAMPLING,
        runtime: DEFAULT_RUNTIME,
        systemPrompt: '',
        panel: 'compact',
        models: [],
        backend: null,
        runtimeStatus: null,
        profiles: [],
        sessions: [],
        activeId: null,
        messages: [],
        phase: 'idle',
        generationId: null,
        live: null,
        points: [],
        placement: null,
        lastMetrics: null,
        error: null,
        abort: null,

        set: (patch) => set(patch),
        setGeneration: (p) => set((s) => ({ generation: { ...s.generation, ...p }, profileId: null })),
        setRuntime: (p) => set((s) => ({ runtime: { ...s.runtime, ...p }, profileId: null })),

        refreshModels: async () => {
          try {
            const r = await chatApi.models();
            set((s) => ({
              models: r.items,
              backend: r.backend,
              runtimeStatus: r.runtime,
              modelId:
                s.modelId && r.items.some((m) => m.id === s.modelId && m.loadable)
                  ? s.modelId
                  : r.items.find((m) => m.loadable)?.id ?? null,
            }));
          } catch {
            /* engine offline: handled by the global banner */
          }
        },
        refreshSessions: async () => {
          try {
            set({ sessions: (await chatApi.sessions()).items });
          } catch {
            /* offline */
          }
        },
        refreshProfiles: async () => {
          try {
            set({ profiles: await chatApi.profiles() });
          } catch {
            /* offline */
          }
        },
        openSession: async (id) => {
          if (get().phase !== 'idle' && id !== get().activeId) return;
          if (!id) {
            set({ activeId: null, messages: [], lastMetrics: null, points: [], live: null, error: null });
            return;
          }
          try {
            const s = await chatApi.session(id);
            const msgs = (s.messages ?? []).filter((m) => m.role !== 'system');
            const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant' && m.metrics);
            set({
              activeId: id,
              messages: msgs,
              lastMetrics: get().phase === 'idle' ? lastAssistant?.metrics ?? null : get().lastMetrics,
              error: null,
            });
          } catch (e) {
            toast.error('Could not open conversation', errorMessage(e));
          }
        },
        send: async (content) => {
          const now = new Date().toISOString();
          const user: ChatMessage = {
            id: 'pending-user',
            session_id: get().activeId ?? '',
            seq: 1e9 - 1,
            role: 'user',
            content,
            reasoning: null,
            status: 'complete',
            metrics: null,
            created_at: now,
          };
          await run({ content }, [...get().messages, user]);
        },
        regenerate: async () => {
          const msgs = get().messages;
          const lastUser = msgs.map((m) => m.role).lastIndexOf('user');
          await run({ regenerate: true }, msgs.slice(0, lastUser + 1));
        },
        editAndResend: async (messageId, content) => {
          const msgs = get().messages;
          const i = msgs.findIndex((m) => m.id === messageId);
          if (i < 0) return;
          await run({ edit_message_id: messageId, content }, [...msgs.slice(0, i), { ...msgs[i], content }]);
        },
        stop: async () => {
          const { abort, generationId } = get();
          set({ phase: 'stopping' });
          try {
            await chatApi.stop(generationId ?? undefined);
          } catch {
            /* fall back to closing the stream */
          }
          window.setTimeout(() => abort?.abort(), 1500);
        },
      };
    },
    {
      name: 'aether.chat.v1',
      version: 1,
      partialize: (s) => ({
        modelId: s.modelId,
        profileId: s.profileId,
        generation: s.generation,
        runtime: s.runtime,
        systemPrompt: s.systemPrompt,
        panel: s.panel,
        activeId: s.activeId,
      }),
    },
  ),
);
