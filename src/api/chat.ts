import { API_BASE, ApiError } from './client';

/* ------------------------------------------------------------------ types */
export type RuntimeState = 'unloaded' | 'loading' | 'ready' | 'unloading' | 'error';

export interface RuntimeConfig {
  n_ctx: number;
  n_gpu_layers: number;
  n_threads: number | null;
  n_batch: number;
  n_ubatch: number;
  flash_attn: 'on' | 'off' | 'auto';
  cache_type_k: string;
  cache_type_v: string;
}

export interface SamplingParams {
  temperature: number;
  top_p: number;
  top_k: number;
  min_p: number;
  repeat_penalty: number;
  max_tokens: number;
  seed: number | null;
}

export const DEFAULT_RUNTIME: RuntimeConfig = {
  n_ctx: 4096,
  n_gpu_layers: 99,
  n_threads: null,
  n_batch: 2048,
  n_ubatch: 512,
  flash_attn: 'auto',
  cache_type_k: 'f16',
  cache_type_v: 'f16',
};

export const DEFAULT_SAMPLING: SamplingParams = {
  temperature: 0.7,
  top_p: 0.95,
  top_k: 40,
  min_p: 0.05,
  repeat_penalty: 1.1,
  max_tokens: 1024,
  seed: null,
};

export interface Placement {
  layers_on_gpu: number | null;
  layers_total: number | null;
  device: string | null;
  buffers_mib: Record<string, Record<string, number>>;
}

export interface RuntimeStatus {
  state: RuntimeState;
  model_id: string | null;
  model_path: string | null;
  config: RuntimeConfig | null;
  pid: number | null;
  port: number | null;
  since: number | null;
  load_time_s: number | null;
  vram_resident_bytes?: number | null;
  placement: Placement;
  build_info: string | null;
  error: string | null;
  log_tail: string[];
}

export interface ChatModel {
  id: string;
  name: string;
  architecture: string | null;
  format: string;
  quantization: string | null;
  file_size_bytes: number;
  n_params: number | null;
  context_length: number | null;
  n_layers: number | null;
  loadable: boolean;
  unavailable_reason: string | null;
  state: RuntimeState;
  backend: string;
}

export interface BackendInfo {
  name: string;
  available: boolean;
  version: string | null;
  kv_cache_types: string[];
  flash_attn_modes: string[];
  max_threads: number | null;
  gpu: string | null;
  accelerator: string;
  supports: Record<string, boolean>;
}

export interface HwSample {
  t: number;
  ts: string;
  gpu_util: number | null;
  vram_used: number | null;
  gpu_temp: number | null;
  gpu_power_w: number | null;
  energy_mj: number | null;
  cpu_util: number | null;
  ram_used: number | null;
  proc_rss: number | null;
}

export interface HwSummary {
  samples: number;
  duration_s: number;
  peak_vram_bytes: number | null;
  vram_delta_bytes: number | null;
  peak_ram_bytes: number | null;
  peak_proc_rss_bytes: number | null;
  mean_gpu_util: number | null;
  max_gpu_util: number | null;
  mean_cpu_util: number | null;
  max_gpu_temp: number | null;
  mean_power_w: number | null;
  gpu_energy_j: number | null;
  energy_note: string;
}

export interface MessageMetrics {
  measured_at: string;
  generation_id: string;
  model: { id: string; name: string; quantization: string | null; fingerprint: string | null; path: string };
  generation_params: SamplingParams;
  runtime: RuntimeConfig;
  profile_id: string | null;
  finish_reason: string | null;
  wall: { ttft_ms: number | null; tpot_ms: number | null; tokens_per_s: number | null; total_ms: number | null; streamed_chunks: number };
  engine: {
    prompt_tokens: number | null;
    prompt_tokens_processed: number | null;
    prompt_tokens_cached: number | null;
    prompt_ms: number | null;
    prompt_tokens_per_s: number | null;
    completion_tokens: number | null;
    generation_ms: number | null;
    tpot_ms: number | null;
    tokens_per_s: number | null;
  };
  hardware: HwSummary | null;
  energy_per_token_j: number | null;
  load: { load_time_s: number | null; placement: Placement } | null;
  timeline?: { t: number; tokens: number; tps: number | null }[];
  notes: string[];
}

export interface ChatMessage {
  id: string;
  session_id: string;
  seq: number;
  role: 'system' | 'user' | 'assistant';
  content: string;
  reasoning: string | null;
  status: 'complete' | 'generating' | 'stopped' | 'error';
  metrics: MessageMetrics | null;
  created_at: string;
}

export interface ChatSession {
  id: string;
  title: string;
  model_id: string | null;
  profile_id: string | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
  messages?: ChatMessage[];
}

export interface LiveSnapshot {
  generation_id: string;
  model_id: string;
  status: string;
  started_at: string;
  elapsed_ms: number | null;
  ttft_ms: number | null;
  streamed_tokens: number;
  live_tokens_per_s: number | null;
  avg_tokens_per_s: number | null;
  sample?: HwSample;
}

export interface ChatProfile {
  id: string;
  name: string;
  model_id: string | null;
  generation: SamplingParams;
  runtime: RuntimeConfig;
  notes: string | null;
  model: { id: string; name: string; path: string; quantization: string | null; format: string } | null;
  backend: string;
  created_at: string;
  updated_at: string;
}

export interface Preset {
  id: string;
  name: string;
  available: boolean;
  rationale?: string;
  generation?: SamplingParams;
  runtime?: RuntimeConfig;
  estimate?: { vram_bytes: number; ram_bytes: number; oom_risk: string; layers_on_gpu: number; basis: string } | null;
  reason?: string | null;
}

export interface PresetsResponse {
  model_id: string;
  hardware: { accelerator: string; vram_free_bytes: number | null; ram_available_bytes: number; logical_cores: number | null };
  train_context: number;
  n_layers: number;
  presets: Preset[];
  note: string;
}

export interface Agg {
  median: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
  std: number | null;
  n: number;
}

export interface CompareResult {
  measured_at: string;
  hardware: { gpu: string | null; cpu: string | null; driver: string | null };
  backend: string | null;
  protocol: { prompt: string; system_prompt: string | null; generation: SamplingParams; warmup_runs: number; repetitions: number; statistic: string };
  metrics: Record<string, { direction: 'max' | 'min'; label: string; unit: string }>;
  configs: {
    label: string;
    model: { id: string; name: string; quantization: string | null; fingerprint: string | null };
    runtime: RuntimeConfig;
    load_time_s: number | null;
    placement: Placement;
    vram_baseline_bytes: number | null;
    vram_resident_bytes: number | null;
    runs: Record<string, number | string | null>[];
    stats: Record<string, Agg | null>;
    output_sample: string;
    deterministic_output: boolean;
  }[];
  comparison: Record<
    string,
    { medians: Record<string, number | null>; best: string | null; reference: string; vs_reference: Record<string, { absolute: number; percent: number | null }> }
  >;
  quality: { evaluated: boolean; note: string };
  notes: string[];
}

export interface Comparison {
  id: string;
  status: string;
  request: {
    prompt: string;
    generation: SamplingParams;
    configs: { label: string; model_id: string; runtime: RuntimeConfig }[];
    warmup_runs: number;
    repetitions: number;
  };
  results: CompareResult | null;
  job_id: string | null;
  job?: { id: string; status: string; progress: number; stage: string | null; error: { code: string; message: string } | null };
  created_at: string;
  updated_at: string;
}

export type StreamEvent =
  | { type: 'session'; data: { session_id: string; title: string; assistant_message_id: string; generation_id: string } }
  | { type: 'status'; data: { state: string; placement?: Placement; build_info?: string | null; load?: { load_time_s: number | null; placement: Placement } | null; model_id?: string } }
  | { type: 'token'; data: { text: string } }
  | { type: 'reasoning'; data: { text: string } }
  | { type: 'metrics'; data: LiveSnapshot }
  | { type: 'done'; data: { message: ChatMessage; metrics: MessageMetrics } }
  | { type: 'error'; data: { code: string; message: string; details?: unknown } };

export interface GenerateBody {
  model_id: string;
  session_id?: string | null;
  content?: string | null;
  edit_message_id?: string | null;
  regenerate?: boolean;
  system_prompt?: string | null;
  generation: SamplingParams;
  runtime: RuntimeConfig;
  profile_id?: string | null;
}

/* ----------------------------------------------------------------- client */
async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${API_BASE}/chat${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'ENGINE_OFFLINE', 'The AETHER engine is not reachable.');
  }
  if (r.status === 204) return undefined as T;
  const payload = await r.json().catch(() => null);
  if (!r.ok) {
    const e = payload?.error;
    throw new ApiError(r.status, e?.code ?? 'HTTP_ERROR', e?.message ?? `HTTP ${r.status}`, e?.details ?? null);
  }
  return payload as T;
}

export const chatApi = {
  models: () => req<{ items: ChatModel[]; runtime: RuntimeStatus; backend: BackendInfo }>('GET', '/models'),
  runtime: () => req<RuntimeStatus>('GET', '/runtime'),
  load: (model_id: string, runtime: RuntimeConfig) => req<RuntimeStatus>('POST', '/runtime/load', { model_id, runtime }),
  unload: () => req<RuntimeStatus>('POST', '/runtime/unload'),
  sessions: () => req<{ items: ChatSession[]; total: number }>('GET', '/sessions?limit=500'),
  session: (id: string) => req<ChatSession>('GET', `/sessions/${id}`),
  createSession: (title?: string, model_id?: string | null) => req<ChatSession>('POST', '/sessions', { title, model_id }),
  renameSession: (id: string, title: string) => req<ChatSession>('PATCH', `/sessions/${id}`, { title }),
  deleteSession: (id: string) => req<void>('DELETE', `/sessions/${id}`),
  stop: (generation_id?: string) => req<{ stopped: boolean }>('POST', '/stop', { generation_id }),
  metrics: () => req<{ runtime: RuntimeStatus; generation: LiveSnapshot | null }>('GET', '/metrics'),
  profiles: () => req<ChatProfile[]>('GET', '/profiles'),
  createProfile: (p: { name: string; model_id: string | null; generation: SamplingParams; runtime: RuntimeConfig; notes?: string | null }) =>
    req<ChatProfile>('POST', '/profiles', p),
  updateProfile: (id: string, p: Partial<{ name: string; model_id: string; generation: SamplingParams; runtime: RuntimeConfig; notes: string }>) =>
    req<ChatProfile>('PATCH', `/profiles/${id}`, p),
  duplicateProfile: (id: string) => req<ChatProfile>('POST', `/profiles/${id}/duplicate`),
  deleteProfile: (id: string) => req<void>('DELETE', `/profiles/${id}`),
  presets: (model_id: string) => req<PresetsResponse>('GET', `/presets?model_id=${encodeURIComponent(model_id)}`),
  compare: (body: unknown) => req<Comparison>('POST', '/compare', body),
  comparisons: () => req<Comparison[]>('GET', '/compare?limit=50'),
  comparison: (id: string) => req<Comparison>('GET', `/compare/${id}`),
};

/**
 * POST /chat/generate and parse the Server-Sent Events stream.
 * Aborting the signal closes the connection, which stops the generation
 * on the engine.
 */
export async function streamGenerate(
  body: GenerateBody,
  onEvent: (e: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  let r: Response;
  try {
    r = await fetch(`${API_BASE}/chat/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    throw new ApiError(0, 'ENGINE_OFFLINE', 'The AETHER engine is not reachable.');
  }
  if (!r.ok || !r.body) {
    const payload = await r.json().catch(() => null);
    const e = payload?.error;
    throw new ApiError(r.status, e?.code ?? 'HTTP_ERROR', e?.message ?? `HTTP ${r.status}`, e?.details ?? null);
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(buffer[idx] === '\r' ? idx + 4 : idx + 2);
        let type = 'message';
        const data: string[] = [];
        for (const line of raw.split(/\r?\n/)) {
          if (line.startsWith('event:')) type = line.slice(6).trim();
          else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
        }
        if (!data.length) continue; // keep-alive comment
        onEvent({ type, data: JSON.parse(data.join('\n')) } as StreamEvent);
      }
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    throw new ApiError(0, 'STREAM_INTERRUPTED', 'The connection to the engine was interrupted during generation.');
  }
}
