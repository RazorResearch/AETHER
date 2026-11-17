/**
 * Engine API types — mirror of docs/API_CONTRACT.md (snake_case, as served).
 * `null` always means "not read / not measured"; never substitute 0.
 */

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ExperimentStatus = 'draft' | JobStatus;
export type MetricBasis = 'measured' | 'estimated' | 'proxy';

export interface ApiErrorBody {
  code: string;
  message: string;
  details: unknown;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/* ------------------------------------------------------------------ system */
export interface EngineStatus {
  name: string;
  available: boolean;
  version: string | null;
  capabilities: Record<string, boolean>;
  details: Record<string, unknown>;
  reason: string | null;
}

export interface Health {
  status: 'ok';
  engine: string;
  version: string;
  schema_version: number;
  engines: EngineStatus[];
  config: {
    data_dir: string;
    db_path: string;
    model_dirs: string[];
    llamacpp_dir: string | null;
    max_concurrent_jobs: number;
  };
}

export interface GPUInfo {
  index: number;
  vendor: string;
  name: string | null;
  uuid: string | null;
  vram_total_bytes: number | null;
  vram_free_bytes: number | null;
  vram_used_bytes: number | null;
  utilization_gpu_percent: number | null;
  utilization_memory_percent: number | null;
  temperature_c: number | null;
  power_draw_w: number | null;
  power_limit_w: number | null;
  compute_capability: string | null;
  energy_counter_supported: boolean;
}

export interface HardwareSnapshot {
  captured_at: string;
  gpus: GPUInfo[];
  cpu: {
    model: string | null;
    architecture: string | null;
    physical_cores: number | null;
    logical_cores: number | null;
    frequency_mhz: number | null;
    utilization_percent: number | null;
    per_core_utilization_percent: number[];
  };
  memory: {
    total_bytes: number;
    available_bytes: number;
    used_bytes: number;
    percent: number;
    swap_total_bytes: number;
    swap_used_bytes: number;
  };
  disks: { path: string; total_bytes: number; free_bytes: number; used_bytes: number }[];
  software: {
    os: string;
    os_release: string;
    python: string;
    nvidia_driver_version: string | null;
    cuda_driver_version: string | null;
    cuda_runtime_version: string | null;
    nvml_version: string | null;
    torch_version: string | null;
    torch_cuda_available: boolean | null;
  };
  cuda_available: boolean;
  accelerator: 'cuda' | 'cpu';
  warnings: string[];
}

/* ------------------------------------------------------------------ models */
export interface ModelSummary {
  id: string;
  name: string;
  path: string;
  format: 'gguf' | 'safetensors';
  architecture: string | null;
  n_params: number | null;
  file_size_bytes: number;
  quantization: string | null;
  context_length: number | null;
  fingerprint: string | null;
  status: 'available' | 'missing';
  created_at: string;
  updated_at: string;
}

export interface LayerInfo {
  index: number;
  n_params: number;
  nbytes: number | null;
  types: Record<string, number>;
}

export interface ModelAnalysis {
  format: 'gguf' | 'safetensors';
  path: string;
  file_size_bytes: number;
  name: string | null;
  size_label: string | null;
  n_params: number | null;
  n_tensors: number;
  tensor_data_bytes: number | null;
  architecture: {
    architecture: string | null;
    n_layers: number | null;
    embedding_length: number | null;
    feed_forward_length: number | null;
    n_heads: number | null;
    n_kv_heads: number | number[] | null;
    key_length: number | null;
    value_length: number | null;
    context_length: number | null;
    vocab_size: number | null;
    rope_freq_base: number | null;
    expert_count: number | null;
    expert_used_count: number | null;
    sliding_window: number | null;
  };
  quantization: {
    file_type: string | null;
    quantization_version: number | null;
    tensor_type_counts: Record<string, number>;
    tensor_type_bytes: Record<string, number>;
    bits_per_weight: number | null;
  };
  layers: LayerInfo[];
  non_layer_tensors: { name: string; n_tensors: number; n_params: number; nbytes: number | null }[];
  metadata: Record<string, unknown>;
  provenance: Record<string, string>;
  warnings: string[];
}

export interface ModelDetail extends ModelSummary {
  analysis: ModelAnalysis | null;
}

export interface ScanResult {
  imported: ModelSummary[];
  skipped: string[];
  errors: { path: string; error: string }[];
}

/* -------------------------------------------------------------------- jobs */
export interface Job {
  id: string;
  kind: string;
  status: JobStatus;
  progress: number;
  stage: string | null;
  params: Record<string, unknown>;
  error: ApiErrorBody | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

export interface JobResults<R = Record<string, unknown>> {
  job_id: string;
  status: JobStatus;
  result: R | null;
}

/* ------------------------------------------------------------- experiments */
export interface ExperimentType {
  id: string;
  name: string;
  description: string;
  cost: 'cheap' | 'moderate' | 'expensive';
  requires: string[];
  config_schema: Record<string, unknown>;
}

export interface Experiment {
  id: string;
  name: string;
  type: string;
  model_id: string | null;
  hypothesis: string | null;
  status: ExperimentStatus;
  config: Record<string, unknown>;
  result: Record<string, unknown> | null;
  job_id: string | null;
  job: { id: string; status: JobStatus; progress: number; stage: string | null; error: ApiErrorBody | null } | null;
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------- benchmarks */
export interface RuntimeParams {
  n_gpu_layers?: number;
  n_threads?: number | null;
  n_batch?: number | null;
  n_ubatch?: number | null;
  cache_type_k?: string;
  cache_type_v?: string;
  flash_attn?: boolean | null;
  n_ctx?: number | null;
}

export interface BenchParams {
  n_prompt?: number;
  n_gen?: number;
  repetitions?: number;
  runtime?: RuntimeParams;
}

export interface BenchmarkSpec {
  model_id: string;
  engine?: string;
  params?: BenchParams;
  perplexity_dataset?: string | null;
  perplexity_ctx?: number;
  perplexity_chunks?: number | null;
  experiment_id?: string | null;
  label?: string | null;
}

export interface Aggregate {
  mean: number;
  std: number | null;
  min: number;
  max: number;
  n: number;
}

export interface ResourceUsage {
  peak_ram_bytes: number | null;
  peak_vram_bytes: number | null;
  vram_method: 'nvml_process' | 'device_delta' | null;
  energy_joules: number | null;
  energy_method: string | null;
  avg_power_w: number | null;
  wall_time_s: number | null;
}

export interface BenchmarkRecord {
  schema_version: number;
  aether_engine: string;
  created_at: string;
  model: {
    model_id: string;
    name: string;
    path: string;
    fingerprint: string | null;
    format: string;
    architecture: string | null;
    n_params: number | null;
    quantization: string | null;
    file_size_bytes: number;
  };
  engine: string;
  engine_version: string | null;
  hardware_profile_id: string;
  hardware_fingerprint: string;
  params: Required<Pick<BenchParams, 'n_prompt' | 'n_gen' | 'repetitions'>> & { runtime: RuntimeParams };
  speed: {
    prompt_tokens_per_s: number | null;
    prompt_tokens_per_s_std: number | null;
    gen_tokens_per_s: number | null;
    gen_tokens_per_s_std: number | null;
    prompt_eval_ms: number | null;
    ttft_ms: number | null;
    samples_prompt_ts: number[];
    samples_gen_ts: number[];
    resources: ResourceUsage;
    engine_version: string | null;
  } | null;
  prompt_tps: Aggregate | null;
  gen_tps: Aggregate | null;
  quality: { perplexity?: { perplexity: number; uncertainty: number | null; n_ctx: number; dataset: string } };
  stability: { prompt_cv?: number; gen_cv?: number };
  notes: string[];
}

export interface Benchmark {
  id: string;
  model_id: string | null;
  experiment_id: string | null;
  hardware_profile_id: string | null;
  engine: string;
  engine_version: string | null;
  status: JobStatus;
  spec: BenchmarkSpec;
  record: BenchmarkRecord | null;
  job_id: string | null;
  created_at: string;
  updated_at: string;
}

/* ---------------------------------------------------------------- activity */
export type ActivityCategory = 'system' | 'model' | 'experiment' | 'benchmark' | 'optimization' | 'hardware';
export type ActivityStatus = 'info' | 'success' | 'warning' | 'error';

export interface ActivityEntry {
  id: string;
  timestamp: string;
  category: ActivityCategory;
  type: string;
  message: string;
  status: ActivityStatus;
  details: Record<string, unknown> | null;
}

/* ------------------------------------------------------------ optimization */
export interface Profile {
  id: string;
  name: string;
  description: string;
  weights: Record<'quality' | 'speed' | 'memory' | 'energy', number>;
}

export interface EstimateRequest {
  model_id: string;
  n_ctx: number;
  cache_type_k?: string;
  cache_type_v?: string;
  flash_attn?: boolean;
  max_vram_bytes?: number | null;
  max_ram_bytes?: number | null;
}

export interface PlacementEstimate {
  n_gpu_layers: number;
  n_ctx: number;
  cache_type_k: string;
  cache_type_v: string;
  flash_attn: boolean;
  gpu_weights_bytes: number;
  cpu_weights_bytes: number;
  gpu_kv_bytes: number;
  cpu_kv_bytes: number;
  compute_buffer_bytes: number;
  gpu_overhead_bytes: number;
  vram_total_bytes: number;
  ram_total_bytes: number;
  fits_vram: boolean | null;
  fits_ram: boolean;
  oom_risk: 'none' | 'low' | 'medium' | 'high' | 'will_not_fit';
  swap_risk: boolean;
  assumptions: string[];
}

export interface KVEstimate {
  n_ctx: number;
  cache_type_k: string;
  cache_type_v: string;
  bytes_per_token: number;
  total_bytes: number;
  per_layer_bytes: number;
  exact_for_architecture: boolean;
  notes: string[];
}

export interface EstimateResponse {
  model_id: string;
  hardware: { accelerator: string; vram_free_bytes: number | null; ram_available_bytes: number };
  memory_plan: {
    recommended: PlacementEstimate | null;
    candidates: PlacementEstimate[];
    reason: string;
    warnings: string[];
  };
  kv_cache: KVEstimate[];
  quantization_presets: {
    preset: string;
    dominant_type: string;
    estimated_bytes: number;
    bits_per_weight: number;
    is_estimate: boolean;
    note: string;
  }[];
  is_estimate: boolean;
  warnings: string[];
}

export interface StartOptimizationRequest {
  model_id: string;
  profile: string;
  custom_weights?: Record<string, number> | null;
  n_ctx: number;
  max_vram_bytes?: number | null;
  max_ram_bytes?: number | null;
  kv_pairs?: [string, string][];
  measure?: boolean;
  perplexity_dataset?: string | null;
  repetitions?: number;
  confirm?: boolean;
}

export interface RankedCandidate {
  id: string;
  config: {
    cache_type_k: string;
    cache_type_v: string;
    n_gpu_layers: number;
    flash_attn: boolean;
    n_ctx: number;
    benchmark_record?: BenchmarkRecord;
  };
  metrics: Partial<Record<'quality' | 'speed' | 'memory' | 'energy', { value: number; basis: MetricBasis }>>;
  feasible: boolean;
  notes: string[];
  score: number;
  pareto_optimal: boolean;
  validated: boolean;
  unmeasured_objectives: string[];
}

export interface OptimizationResult {
  model_id: string;
  profile: string;
  hardware_profile_id: string;
  outcome: 'estimated_only' | 'measured';
  optimization_applied: boolean;
  validated: boolean;
  recommended: RankedCandidate | null;
  candidates: RankedCandidate[];
  notes: string[];
}
