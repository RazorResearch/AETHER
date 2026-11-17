import type {
  ActivityEntry,
  Benchmark,
  BenchmarkSpec,
  EstimateRequest,
  EstimateResponse,
  Experiment,
  ExperimentType,
  HardwareSnapshot,
  Health,
  Job,
  JobResults,
  ModelAnalysis,
  ModelDetail,
  ModelSummary,
  OptimizationResult,
  Page,
  Profile,
  ScanResult,
  StartOptimizationRequest,
} from './types';

/**
 * Engine base URL. In development Vite proxies `/api` to 127.0.0.1:8765
 * (vite.config.ts). A packaged build can point elsewhere with VITE_AETHER_API.
 */
export const API_BASE: string =
  (import.meta.env.VITE_AETHER_API as string | undefined)?.replace(/\/$/, '') ?? '/api/v1';

/** Error raised for every non-2xx answer and for network failures (`ENGINE_OFFLINE`). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get offline(): boolean {
    return this.code === 'ENGINE_OFFLINE';
  }
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, 'ENGINE_OFFLINE', 'The AETHER engine is not reachable.');
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const err = (payload as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    // Without the engine's error envelope, a 5xx comes from the dev proxy
    // (engine process down: Vite answers 500/502/504), not from the engine.
    if (!err && response.status >= 500) {
      throw new ApiError(response.status, 'ENGINE_OFFLINE', 'The AETHER engine is not reachable.');
    }
    throw new ApiError(
      response.status,
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? `Engine answered HTTP ${response.status}`,
      err?.details ?? null,
    );
  }
  return payload as T;
}

const qs = (params: Record<string, string | number | boolean | null | undefined>) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : '';
};

export const api = {
  health: (signal?: AbortSignal) => request<Health>('GET', '/system/health', undefined, signal),
  hardware: (signal?: AbortSignal) => request<HardwareSnapshot>('GET', '/system/hardware', undefined, signal),

  models: () => request<Page<ModelSummary>>('GET', `/models${qs({ limit: 500 })}`),
  model: (id: string) => request<ModelDetail>('GET', `/models/${id}`),
  modelAnalysis: (id: string, includeTensors = false) =>
    request<ModelAnalysis>('GET', `/models/${id}/analysis${qs({ include_tensors: includeTensors })}`),
  importModel: (path: string, name?: string) =>
    request<ModelDetail>('POST', '/models/import', { path, name: name || undefined }),
  scanModels: (directories?: string[]) =>
    request<ScanResult>('POST', '/models/scan', { directories: directories?.length ? directories : undefined }),
  deleteModel: (id: string) => request<void>('DELETE', `/models/${id}`),

  experiments: () => request<Page<Experiment>>('GET', `/experiments${qs({ limit: 500 })}`),
  experimentTypes: () => request<ExperimentType[]>('GET', '/experiments/types'),
  experiment: (id: string) => request<Experiment>('GET', `/experiments/${id}`),
  createExperiment: (body: { name: string; type: string; hypothesis?: string; config: Record<string, unknown> }) =>
    request<Experiment>('POST', '/experiments', body),
  startExperiment: (id: string, confirm = false) =>
    request<Experiment>('POST', `/experiments/${id}/start`, { confirm }),
  deleteExperiment: (id: string) => request<void>('DELETE', `/experiments/${id}`),

  benchmarks: () => request<Page<Benchmark>>('GET', `/benchmarks${qs({ limit: 500 })}`),
  benchmark: (id: string) => request<Benchmark>('GET', `/benchmarks/${id}`),
  createBenchmark: (spec: BenchmarkSpec) => request<Benchmark>('POST', '/benchmarks', spec),
  compareBenchmarks: (a: string, b: string) =>
    request<{ comparable: boolean; issues: string[] }>('GET', `/benchmarks/compare${qs({ a, b })}`),

  activity: (limit = 500) => request<Page<ActivityEntry>>('GET', `/activity${qs({ limit })}`),

  profiles: () => request<Profile[]>('GET', '/optimization/profiles'),
  estimate: (body: EstimateRequest, signal?: AbortSignal) =>
    request<EstimateResponse>('POST', '/optimization/estimate', body, signal),
  startOptimization: (body: StartOptimizationRequest) => request<Job>('POST', '/optimization/start', body),
  jobs: () => request<Page<Job>>('GET', `/optimization/jobs${qs({ limit: 200 })}`),
  job: (id: string) => request<Job>('GET', `/optimization/${id}`),
  jobResults: <R = OptimizationResult>(id: string) => request<JobResults<R>>('GET', `/optimization/${id}/results`),
  cancelJob: (id: string) => request<Job>('POST', `/optimization/${id}/cancel`),
};

/** Human-readable message for toasts. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
