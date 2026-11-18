# AETHER Engine — API Contract (v1)

Audience: the frontend (React/TypeScript) team. This document is the source of
truth for request/response shapes. The live OpenAPI schema is served by the
engine at `GET /api/v1/openapi.json` (Swagger UI at `/docs`).

- Base URL (default): `http://127.0.0.1:8765/api/v1`
- Start the engine: `cd backend && python -m app.cli serve` (see `backend/README.md`)
- CORS: `http://localhost:5173`, `http://127.0.0.1:5173`, `tauri://localhost` are allowed by default
  (override with `AETHER_CORS_ORIGINS`, comma-separated).
- Encoding: JSON, UTF-8. Field names are `snake_case`.
- Units: **bytes** for every memory/disk size (`*_bytes`), **seconds** (`*_s`), **milliseconds** (`*_ms`),
  **watts** (`*_w`), **joules** (`energy_joules`), **°C** (`temperature_c`), percentages 0–100 (`*_percent`),
  progress 0–1 (`progress`).
- Timestamps: ISO 8601 UTC strings, e.g. `2026-11-18T09:12:44.512Z`.
- IDs: opaque strings with a prefix — `mdl_`, `exp_`, `bench_`, `job_`, `hw_`, `act_`. Do not parse them.
- `null` means *unknown / not measured*. The engine never fills a value it did not read or measure;
  the UI should display "—" or "not available" rather than 0.

Stability: fields may be **added** in v1; existing fields will not be renamed or removed without a `/api/v2`.

---

## 1. Conventions

### 1.1 Errors

Every non-2xx response has the same envelope:

```json
{ "error": { "code": "NOT_FOUND", "message": "Model 'mdl_x' not found", "details": { "model_id": "mdl_x" } } }
```

| HTTP | `code` | Meaning / UI hint |
|---|---|---|
| 404 | `NOT_FOUND`, `FILE_NOT_FOUND` | Unknown id, or file missing on disk |
| 409 | `MODEL_ALREADY_EXISTS`, `CONFLICT`, `ALREADY_RUNNING` | Duplicate or state conflict |
| 409 | `CONFIRMATION_REQUIRED` | Expensive operation: ask the user, then resend with `"confirm": true` |
| 415 | `UNSUPPORTED_FORMAT`, `CORRUPT_FILE` | File is not a supported/valid model |
| 422 | `VALIDATION_ERROR` | Bad request body; `details` is a list of `{loc, msg, type}` |
| 501 | `NOT_IMPLEMENTED` | Feature exists in the contract but not in this engine version |
| 503 | `ENGINE_UNAVAILABLE` | Required tool missing (llama.cpp, PyTorch…); `details` explains which |
| 507 | `INSUFFICIENT_RESOURCES` | Would exceed disk/memory budget |
| 500 | `INTERNAL_ERROR`, `EXECUTION_FAILED` | Unexpected failure; `message` is human-readable |

Job errors (inside a job object, not HTTP) use the same `{code, message, details}` shape and add
`CANCELLED`, `TIMEOUT`, `INTERRUPTED` (engine restarted while the job was running).

### 1.2 Pagination

List endpoints accept `limit` (default 100) and `offset` (default 0) and return:

```json
{ "items": [ ... ], "total": 42, "limit": 100, "offset": 0 }
```

### 1.3 Long-running operations (jobs)

Benchmarks, experiments and optimization searches run in the background. One heavy job runs at a time
(8 GB VRAM target); others wait in `queued`.

```ts
type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

interface Job {
  id: string;            // "job_…"
  kind: string;          // "benchmark" | "optimization" | "experiment:<type>"
  status: JobStatus;
  progress: number;      // 0..1
  stage: string | null;  // human-readable current step, e.g. "benchmark kv-q8_0-q8_0-ngl29"
  params: object;        // the request that created the job
  error: { code: string; message: string; details: any } | null;
  created_at: string; started_at: string | null; finished_at: string | null; updated_at: string;
}
```

Polling: `GET /optimization/{job_id}` every 1–2 s while `status` is `queued`/`running`.
Result: `GET /optimization/{job_id}/results` → `{ job_id, status, result }` (`result` is `null` until
`completed`). Cancel: `POST /optimization/{job_id}/cancel`. The `/optimization/{job_id}` endpoints work for
**every** job kind (benchmark and experiment jobs too).

`completed` means *the job ran to the end*. It never means "the model was optimized": see
`optimization_applied` and `validated` in results.

---

## 2. System

### `GET /system/health`

```json
{
  "status": "ok", "engine": "aether-engine", "version": "0.1.0", "schema_version": 1,
  "engines": [
    { "name": "llama.cpp", "available": false, "version": null,
      "capabilities": { "bench": false, "perplexity": false, "quantize": false, "imatrix": false },
      "details": { "binaries": {} }, "reason": "No llama.cpp binaries found (set AETHER_LLAMACPP_DIR)." },
    { "name": "pytorch", "available": false, "version": null, "capabilities": {}, "details": {},
      "reason": "PyTorch is not installed (optional dependency: pip install torch)." }
  ],
  "config": { "data_dir": "/home/me/.aether", "db_path": "/home/me/.aether/aether.db",
              "model_dirs": ["/home/me/models"], "llamacpp_dir": null, "max_concurrent_jobs": 1 }
}
```

`config` is read-only (engine environment variables).

Use it as the "engine connected" indicator. `GET /system/engines` returns only the `engines` array.

### `GET /system/hardware`

Live snapshot, read on each call (~100 ms because CPU load is sampled). Real example from the reference
machine (abridged):

```json
{
  "captured_at": "2026-11-17T22:59:11.924Z",
  "accelerator": "cuda",
  "cuda_available": true,
  "gpus": [{
    "index": 0, "vendor": "NVIDIA", "name": "NVIDIA GeForce RTX 5060", "uuid": "GPU-…",
    "vram_total_bytes": 8546942976, "vram_free_bytes": 6321414144, "vram_used_bytes": 2225528832,
    "utilization_gpu_percent": 3.0, "utilization_memory_percent": 7.0, "temperature_c": 40.0,
    "power_draw_w": 13.4, "power_limit_w": 145.0, "compute_capability": "12.0",
    "energy_counter_supported": true
  }],
  "cpu": { "model": "AMD Ryzen 5 7500F 6-Core Processor", "architecture": "AMD64", "physical_cores": 6,
           "logical_cores": 12, "frequency_mhz": 3701.0, "utilization_percent": 7.7,
           "per_core_utilization_percent": [0.0, 28.6, 14.3, 0.0, 50.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0] },
  "memory": { "total_bytes": 16819507200, "available_bytes": 5958881280, "used_bytes": 10860625920,
              "percent": 64.6, "swap_total_bytes": 25769803776, "swap_used_bytes": 8599883776 },
  "disks": [{ "path": "/home/user/.aether", "total_bytes": 498935525376, "free_bytes": 16464457728,
              "used_bytes": 482471067648 }],
  "software": { "os": "Linux", "os_release": "6.8.0", "python": "3.12.10",
                "nvidia_driver_version": "617.42", "cuda_driver_version": "13.4", "cuda_runtime_version": null,
                "nvml_version": "13.617.42", "torch_version": null, "torch_cuda_available": null },
  "warnings": []
}
```

Without an NVIDIA GPU: `gpus: []`, `accelerator: "cpu"`, driver/CUDA fields `null`, and `warnings`
explains why. `cuda_driver_version` is the highest CUDA version the driver supports, not an installed toolkit.

**Mapping to the frontend `TelemetrySnapshot`** (all sizes are bytes → divide by `1e9` for GB or
`2**30` for GiB):

| `TelemetrySnapshot` | Engine field |
|---|---|
| `capturedAt` | `captured_at` |
| `gpuName` | `gpus[0].name` (absent if `gpus` is empty) |
| `vramUsedGb` / `vramTotalGb` | `gpus[0].vram_used_bytes` / `gpus[0].vram_total_bytes` |
| `gpuUtilization` | `gpus[0].utilization_gpu_percent` |
| `gpuTemperatureC` | `gpus[0].temperature_c` (may be `null`) |
| `cpuName` / `cpuCores` | `cpu.model` / `cpu.logical_cores` |
| `cpuUtilization` / `coreLoad` | `cpu.utilization_percent` / `cpu.per_core_utilization_percent` |
| `ramUsedGb` / `ramTotalGb` | `memory.used_bytes` / `memory.total_bytes` |
| `diskUsedGb` / `diskTotalGb` | `disks[0].used_bytes` / `disks[0].total_bytes` |

---

## 3. Models

Models are registered **by path**. The engine never copies, moves, downloads or deletes model files.

```ts
interface ModelSummary {
  id: string;                         // "mdl_…"
  name: string;                       // general.name from the file, or the file stem
  path: string;                       // absolute path on the engine host
  format: "gguf" | "safetensors";
  architecture: string | null;        // e.g. "qwen2", "llama"
  n_params: number | null;            // exact count of tensor elements
  file_size_bytes: number;
  quantization: string | null;        // llama.cpp preset from general.file_type, e.g. "Q4_K_M"
  context_length: number | null;      // training context from metadata
  fingerprint: string | null;         // "q:<hash>" quick identity (size + first/last MiB)
  status: "available" | "missing";    // "missing" when the file disappeared from disk
  created_at: string; updated_at: string;
}
interface ModelDetail extends ModelSummary { analysis: ModelAnalysis | null; }
```

| Method & path | Body | Response |
|---|---|---|
| `GET /models?format=gguf&limit&offset` | — | `Page<ModelSummary>` (sorted by name) |
| `POST /models/import` | `{ "path": "/abs/model.gguf", "name"?: "My model" }` | `201 ModelDetail` |
| `POST /models/scan` | `{ "directories"?: ["/models"], "max_depth"?: 3 }` | `{ imported: ModelSummary[], skipped: string[], errors: {path, error}[] }` |
| `GET /models/{model_id}` | — | `ModelDetail` |
| `GET /models/{model_id}/analysis?include_tensors=true` | — | `ModelAnalysis` (re-reads the file) |
| `DELETE /models/{model_id}` | — | `204` — removes the library entry only; the file stays on disk |

Import errors: `404 FILE_NOT_FOUND`, `409 MODEL_ALREADY_EXISTS`, `415 UNSUPPORTED_FORMAT` / `CORRUPT_FILE`,
`422 VALIDATION_ERROR` (relative path). A browser file picker cannot provide an absolute path; in the desktop
(Tauri) build pass the real path, in the browser ask the user to paste it.

```ts
interface ModelAnalysis {
  format: "gguf" | "safetensors"; path: string; file_size_bytes: number;
  name: string | null; size_label: string | null;          // e.g. "1.8B" if present in metadata
  n_params: number | null; n_tensors: number; tensor_data_bytes: number | null;
  architecture: {
    architecture: string | null; n_layers: number | null; embedding_length: number | null;
    feed_forward_length: number | null; n_heads: number | null; n_kv_heads: number | number[] | null;
    key_length: number | null; value_length: number | null; context_length: number | null;
    vocab_size: number | null; rope_freq_base: number | null; expert_count: number | null;
    expert_used_count: number | null; sliding_window: number | null;
  };
  quantization: {
    file_type: string | null; quantization_version: number | null;
    tensor_type_counts: Record<string, number>;   // e.g. {"Q4_K": 169, "Q6_K": 29, "F32": 141}
    tensor_type_bytes: Record<string, number>;
    bits_per_weight: number | null;               // exact average
  };
  layers: { index: number; n_params: number; nbytes: number | null; types: Record<string, number>;
            tensors: { name: string; shape: number[]; type: string; n_params: number; nbytes: number | null }[] }[];
  non_layer_tensors: { name: string; n_tensors: number; n_params: number; nbytes: number | null;
                       types: Record<string, number> }[];
  metadata: Record<string, any>;     // raw GGUF keys; huge arrays become {"__array__": true, "length": n}
  provenance: Record<string, string>; // per field: "extracted" | "derived …" | "unavailable"
  warnings: string[];
}
```

Display `provenance` when relevant (e.g. "derived" key length). Fields marked `unavailable` are `null`.

**Mapping to the frontend `LocalModel`:** `sizeBytes ← file_size_bytes`, `contextWindow ← context_length`,
`quantization ← quantization`, `importedAt ← created_at`, `format ← format` (`"gguf"→"GGUF"`,
`"safetensors"→"Safetensors"`), `parameters ← analysis.size_label` (or format `n_params`),
`parametersB ← n_params / 1e9`, `status ← available→"Ready" / missing→"Unavailable"`.
`publisher`, `license`: read `analysis.metadata["general.organization"]` / `["general.license"]` when present,
otherwise unknown. The engine has no notion of `notes`.

---

## 4. Experiments

```ts
type ExperimentStatus = "draft" | "queued" | "running" | "completed" | "failed" | "cancelled";
interface Experiment {
  id: string; name: string; type: string; model_id: string | null; hypothesis: string | null;
  status: ExperimentStatus; config: object; result: object | null; job_id: string | null;
  job: { id: string; status: JobStatus; progress: number; stage: string | null; error: object | null } | null;
  created_at: string; updated_at: string;
}
```

| Method & path | Body | Response |
|---|---|---|
| `GET /experiments?status&type&limit&offset` | — | `Page<Experiment>` |
| `GET /experiments/types` | — | `ExperimentType[]` (with JSON Schema of `config`, usable to build forms) |
| `POST /experiments` | `{ name, type, hypothesis?, config }` | `201 Experiment` (status `draft`) |
| `GET /experiments/{experiment_id}` | — | `Experiment` (includes live `job` progress; so does the list) |
| `POST /experiments/{experiment_id}/start` | `{ "confirm"?: false }` | `202 Experiment` |
| `DELETE /experiments/{experiment_id}` | — | `204` (`409 ALREADY_RUNNING` while queued/running; its benchmarks are kept) |

Available types (v0.1):

| `type` | cost | `config` (main fields) | Needs |
|---|---|---|---|
| `quantization_sensitivity` | moderate | `model_id` (F16/BF16/F32 GGUF), `bits` [2,3,4,5,6,8], `budgets_bits_per_weight` [3.5,4.5,5.5], `max_rows` | nothing (CPU) |
| `kv_cache_comparison` | **expensive** | `model_id`, `pairs` [["f16","f16"],…], `n_ctx`, `n_prompt`, `n_gen`, `repetitions`, `perplexity_dataset?` | llama-bench |
| `quantization_comparison` | **expensive** | `model_id`, `presets` ["Q4_K_M",…], `output_dir?`, `imatrix_path?`, `perplexity_dataset?` | llama-quantize, llama-bench |

`expensive` types answer `409 CONFIRMATION_REQUIRED` until started with `{"confirm": true}`. Show a
confirmation dialog listing `details.requires`.

Results always contain `validated: boolean`. `validated: false` means the outcome is an estimate or a proxy
and must be labelled as such in the UI.

**Mapping to the frontend `Experiment`:** `description ← hypothesis`, `modelId ← model_id`,
status `draft→Draft`, `queued→Pending`, `running→Running`, `completed→Completed`,
`failed|cancelled→Failed`. `strategyIds`/`target` have no direct equivalent: an experiment has one `type`.

---

## 5. Benchmarks

| Method & path | Body | Response |
|---|---|---|
| `GET /benchmarks?model_id&experiment_id&status&limit&offset` | — | `Page<Benchmark>` |
| `POST /benchmarks` | `BenchmarkSpec` | `202 Benchmark` (or `503 ENGINE_UNAVAILABLE`) |
| `GET /benchmarks/{benchmark_id}` | — | `Benchmark` |
| `GET /benchmarks/compare?a=bench_1&b=bench_2` | — | `{ comparable: boolean, issues: string[] }` |

```ts
interface BenchmarkSpec {
  model_id: string;
  engine?: "llama.cpp";
  params?: { n_prompt?: 512; n_gen?: 128; repetitions?: 5;
             runtime?: { n_gpu_layers?: 99; n_threads?: number|null; n_batch?: number|null; n_ubatch?: number|null;
                         cache_type_k?: "f16"; cache_type_v?: "f16"; flash_attn?: boolean|null } };
  perplexity_dataset?: string | null;  // absolute path to a local text file
  perplexity_ctx?: 512; perplexity_chunks?: number | null;
  experiment_id?: string | null; label?: string | null;
}
interface Benchmark {
  id: string; model_id: string | null; experiment_id: string | null; hardware_profile_id: string | null;
  engine: string; engine_version: string | null; status: JobStatus; spec: BenchmarkSpec;
  record: BenchmarkRecord | null;   // null until completed
  job_id: string | null; created_at: string; updated_at: string;
}
interface BenchmarkRecord {
  schema_version: 1; aether_engine: string; created_at: string;
  model: { model_id, name, path, fingerprint, format, architecture, n_params, quantization, file_size_bytes };
  engine: string; engine_version: string | null;
  hardware_profile_id: string; hardware_fingerprint: string;
  params: BenchParams;
  speed: {
    prompt_tokens_per_s: number|null; prompt_tokens_per_s_std: number|null;
    gen_tokens_per_s: number|null; gen_tokens_per_s_std: number|null;
    prompt_eval_ms: number|null;
    ttft_ms: number|null;                 // DERIVED: prompt time + 1 token (label it "estimated TTFT")
    samples_prompt_ts: number[]; samples_gen_ts: number[];
    resources: { peak_ram_bytes, peak_vram_bytes, vram_method: "nvml_process"|"device_delta"|null,
                 energy_joules, energy_method, avg_power_w, wall_time_s };
    engine_version: string|null; raw: any;
  } | null;
  prompt_tps: Aggregate | null; gen_tps: Aggregate | null;   // {mean, std, min, max, n}
  quality: { perplexity?: { perplexity: number; uncertainty: number|null; n_ctx: number; dataset: string } };
  stability: { prompt_cv?: number; gen_cv?: number };        // coefficient of variation
  notes: string[];                                           // caveats to display
}
```

Display rules: show `notes`; if `vram_method == "device_delta"`, label peak VRAM "device-level (includes other
processes)". Before showing two runs side by side, call `/benchmarks/compare` and display `issues`.

**Mapping to the frontend `BenchmarkMetric`:** tokens/s ← `record.gen_tps.mean`, TTFT ← `record.speed.ttft_ms`,
Peak VRAM ← `record.speed.resources.peak_vram_bytes`, Peak RAM ← `…peak_ram_bytes`,
perplexity ← `record.quality.perplexity.perplexity`, energy ← `…energy_joules`. Accuracy (GSM8K/ARC/MMLU) is
not produced yet (lm-evaluation-harness integration is planned).

---

## 6. Activity

`GET /activity?category&status&limit&offset` → `Page<ActivityEntry>` (newest first).

```ts
interface ActivityEntry {
  id: string; timestamp: string;
  category: "system" | "model" | "experiment" | "benchmark" | "optimization" | "hardware";
  type: string;            // e.g. "model.imported", "experiment.started", "optimization.completed"
  message: string;
  status: "info" | "success" | "warning" | "error";
  details: object | null;  // ids: model_id, job_id, experiment_id, benchmark_id…
}
```

Mapping to `ActivityEvent`: `description ← message`, category capitalised, status
`success→Success`, `info→Info`, `warning→Warning`, `error→Failed`.

---

## 7. Optimization

### `GET /optimization/profiles`

```json
[
  {"id": "maximum_intelligence", "name": "Maximum Intelligence", "description": "…",
   "weights": {"quality": 0.7, "speed": 0.1, "memory": 0.1, "energy": 0.1}},
  {"id": "balanced", "name": "Balanced Performance", "weights": {"quality": 0.35, "speed": 0.3, "memory": 0.2, "energy": 0.15}},
  {"id": "minimum_memory", "name": "Minimum Memory", "weights": {"quality": 0.2, "speed": 0.1, "memory": 0.6, "energy": 0.1}},
  {"id": "maximum_speed", "name": "Maximum Speed", "weights": {"quality": 0.15, "speed": 0.6, "memory": 0.15, "energy": 0.1}},
  {"id": "custom", "name": "Custom", "weights": {"quality": 0.25, "speed": 0.25, "memory": 0.25, "energy": 0.25}}
]
```

Frontend targets map as `max-intelligence → maximum_intelligence`, `balanced → balanced`,
`min-memory → minimum_memory`; the engine adds `maximum_speed` and `custom`.

### `POST /optimization/estimate` — instant, no execution

Request:

```json
{ "model_id": "mdl_…", "n_ctx": 4096, "cache_type_k": "f16", "cache_type_v": "f16", "flash_attn": true,
  "max_vram_bytes": null, "max_ram_bytes": null }
```

Response (abridged; real values for Qwen2.5-1.5B-Instruct Q4_K_M on the reference machine):

```json
{
  "model_id": "mdl_…",
  "hardware": { "accelerator": "cuda", "vram_free_bytes": 6321414144, "ram_available_bytes": 5958881280 },
  "memory_plan": {
    "reason": "Full GPU offload fits within the VRAM budget.",
    "recommended": {
      "n_gpu_layers": 29, "n_ctx": 4096, "cache_type_k": "f16", "cache_type_v": "f16", "flash_attn": true,
      "gpu_weights_bytes": 980097536, "cpu_weights_bytes": 131272704,
      "gpu_kv_bytes": 117440512, "cpu_kv_bytes": 0,
      "compute_buffer_bytes": 336330752, "gpu_overhead_bytes": 419430400,
      "vram_total_bytes": 1853299200, "ram_total_bytes": 215355392,
      "fits_vram": true, "fits_ram": true,
      "oom_risk": "none",               // none | low | medium | high | will_not_fit
      "swap_risk": false,
      "assumptions": ["compute buffer is a heuristic (ubatch=512), not a measurement", "…"]
    },
    "candidates": [ /* up to 3 PlacementEstimate */ ],
    "warnings": []
  },
  "kv_cache": [ { "n_ctx": 4096, "cache_type_k": "f16", "cache_type_v": "f16", "bytes_per_token": 28672,
                  "total_bytes": 117440512, "per_layer_bytes": 4194304, "exact_for_architecture": true,
                  "notes": [] } ],
  "quantization_presets": [ { "preset": "Q4_K_M", "dominant_type": "Q4_K", "estimated_bytes": 999617280,
                              "bits_per_weight": 4.5, "is_estimate": true, "note": "…" } ],
  "is_estimate": true,
  "warnings": []
}
```

`memory_plan.recommended` is `null` when nothing fits (`reason` explains). Map
`maxVramGb/maxRamGb` constraints to `max_vram_bytes/max_ram_bytes`, `contextLength` to `n_ctx`,
`kvCachePrecision` `f16|q8|q4` to `cache_type_*` `f16|q8_0|q4_0`.

### `POST /optimization/start` → `202 Job`

```json
{ "model_id": "mdl_…", "profile": "balanced", "custom_weights": null, "n_ctx": 4096,
  "max_vram_bytes": null, "max_ram_bytes": null,
  "kv_pairs": [["f16","f16"],["q8_0","q8_0"],["q4_0","q4_0"]],
  "measure": false, "perplexity_dataset": null, "repetitions": 3, "confirm": false }
```

- `measure: false` (default): estimation-only search; runs in < 1 s.
- `measure: true`: benchmarks every feasible candidate on the GPU → requires `confirm: true`
  (`409 CONFIRMATION_REQUIRED` otherwise) and llama.cpp (`503 ENGINE_UNAVAILABLE` otherwise).
- `profile: "custom"` requires `custom_weights` (`{quality, speed, memory, energy}`).

### `GET /optimization/{job_id}` → `Job` · `GET /optimization/{job_id}/results` → `JobResults`

```json
{
  "job_id": "job_…", "status": "completed",
  "result": {
    "model_id": "mdl_…", "profile": "balanced", "hardware_profile_id": "hw_…",
    "outcome": "estimated_only",          // or "measured"
    "optimization_applied": false,        // v0.1 never modifies model files
    "validated": false,                   // true only if every ranking objective was measured
    "recommended": RankedCandidate | null,
    "candidates": RankedCandidate[],
    "notes": ["Weights are not modified: …", "measure=false: speed and energy were not measured; …"]
  }
}
```

```ts
interface RankedCandidate {
  id: string;                                  // e.g. "kv-q8_0-q8_0-ngl29"
  config: { cache_type_k: string; cache_type_v: string; n_gpu_layers: number; flash_attn: boolean;
            n_ctx: number; benchmark_record?: BenchmarkRecord };
  metrics: Record<"quality"|"speed"|"memory"|"energy",
                  { value: number; basis: "measured" | "estimated" | "proxy" }>;  // keys may be absent
  feasible: boolean; notes: string[];
  score: number;                 // 0..1 within this result only
  pareto_optimal: boolean;
  validated: boolean;
  unmeasured_objectives: string[];
}
```

UI requirement: show each metric's `basis`. Never present a candidate with `validated: false` as a proven
improvement. `quality` with basis `proxy` is the mean KV-cache bit-width, not a model-quality score.

`GET /optimization/jobs?kind&status` lists all jobs; `POST /optimization/{job_id}/cancel` cancels.

---

## 8. Chat & live inference (`/chat`)

Interactive generation runs on **llama.cpp's `llama-server`**, managed by the engine (one resident model,
bound to 127.0.0.1 on a free port). Binaries are found in `AETHER_LLAMACPP_DIR`, `backend/vendor/llama.cpp/<build>`
or `PATH`. Without them, chat endpoints answer `503 ENGINE_UNAVAILABLE`.

### Types

```ts
interface RuntimeConfig {            // load-time: changing it reloads the model
  n_ctx: number; n_gpu_layers: number /* 99 = all */; n_threads: number | null; n_batch: number; n_ubatch: number;
  flash_attn: "on" | "off" | "auto"; cache_type_k: string; cache_type_v: string;   // f16 bf16 q8_0 q5_1 q5_0 q4_1 q4_0 iq4_nl
}
interface SamplingParams {           // per request
  temperature: number; top_p: number; top_k: number; min_p: number; repeat_penalty: number;
  max_tokens: number; seed: number | null;
}
interface RuntimeStatus {
  state: "unloaded" | "loading" | "ready" | "unloading" | "error";
  model_id: string | null; config: RuntimeConfig | null; pid: number | null; load_time_s: number | null;
  vram_resident_bytes: number | null;          // device VRAM after load − before load (measured)
  placement: { layers_on_gpu: number | null; layers_total: number | null; device: string | null;
               buffers_mib: Record<string, Record<"model" | "KV" | "compute", number>> };   // from llama.cpp load log
  build_info: string | null; error: string | null; log_tail: string[];
}
```

Validation (422): context ≤ the model's training context; threads ≤ logical cores; `n_ubatch ≤ n_batch`;
supported KV types; a quantized V cache requires `flash_attn` ≠ `off`; GGUF only.

### Endpoints

| Method & path | Body | Response |
|---|---|---|
| `GET /chat/models` | — | `{ items: ChatModel[], runtime: RuntimeStatus, backend: BackendInfo }` — `ChatModel` adds `loadable`, `unavailable_reason`, `state`, `n_layers` |
| `GET /chat/runtime` | — | `RuntimeStatus` |
| `POST /chat/runtime/load` | `{ model_id, runtime }` | `RuntimeStatus` (blocks until ready; `MODEL_LOAD_FAILED` with `details.log_tail`) |
| `POST /chat/runtime/unload` | — | `RuntimeStatus` |
| `GET /chat/sessions` | — | `{ items: (ChatSession & {message_count})[], total }` |
| `POST /chat/sessions` | `{ title?, model_id? }` | `201 ChatSession` |
| `GET /chat/sessions/{id}` | — | `ChatSession & { messages: ChatMessage[] }` |
| `PATCH /chat/sessions/{id}` | `{ title }` | `ChatSession` |
| `DELETE /chat/sessions/{id}` | — | `204` |
| `POST /chat/generate` | `GenerateRequest` | `text/event-stream` (below) |
| `POST /chat/stop` | `{ generation_id? }` | `{ stopped: boolean }` |
| `GET /chat/metrics` | — | `{ runtime, generation: LiveSnapshot | null }` (polling alternative to SSE) |
| `GET /chat/performance?model_id&limit` | — | past answers with their stored metrics |
| `GET /chat/profiles` · `POST /chat/profiles` | `{ name, model_id?, generation, runtime, notes? }` | profiles (`model`, `backend` attached) |
| `PATCH /chat/profiles/{id}` · `POST …/{id}/duplicate` · `DELETE …/{id}` | partial profile | profile / `204` |
| `GET /chat/presets?model_id=` | — | 5 hardware-aware presets (Maximum Speed, Balanced, Low Memory, Maximum Context, Custom) with **estimated** memory |
| `POST /chat/compare` | `CompareRequest` (`confirm: true` required) | `202 Comparison` (job) |
| `GET /chat/compare` · `GET /chat/compare/{id}` | — | comparisons with `job` progress and `results` |

```ts
interface GenerateRequest {
  model_id: string; session_id?: string | null;            // null → new conversation
  content?: string;                                         // new user message, or
  edit_message_id?: string;  /* + content */                // replace a user message and drop what follows, or
  regenerate?: boolean;                                     // drop the last answer and generate it again
  system_prompt?: string | null; generation: SamplingParams; runtime: RuntimeConfig; profile_id?: string | null;
}
```

### SSE events (`POST /chat/generate`)

Validation errors are normal JSON errors **before** the stream. Then, in order:

| event | data |
|---|---|
| `session` | `{ session_id, title, assistant_message_id, generation_id }` |
| `status` | `{ state: "loading", runtime }` (only if a (re)load is needed), then `{ state: "generating", placement, build_info, load }` |
| `token` / `reasoning` | `{ text }` — one streamed chunk (≈ one token); `reasoning` = thinking models' `reasoning_content` |
| `metrics` | `LiveSnapshot` every 250 ms: `streamed_tokens, live_tokens_per_s (1 s window), avg_tokens_per_s, ttft_ms, elapsed_ms, sample: HwSample` |
| `error` | `{ code, message, details }` (`MODEL_LOAD_FAILED`, `RUNTIME_CONNECTION`, `CANCELLED`, …) |
| `done` | `{ message: ChatMessage, metrics: MessageMetrics }` — always last |

`HwSample = { t, ts, gpu_util, vram_used, gpu_temp, gpu_power_w, energy_mj, cpu_util, ram_used, proc_rss }` — every field
nullable (NVML/psutil); `vram_used` is device-level.

`MessageMetrics` (stored on the assistant message): `wall` (AETHER clock: `ttft_ms`, `tpot_ms`, `tokens_per_s`,
`total_ms`, `streamed_chunks`), `engine` (llama.cpp `timings`: prompt tokens/processed/cached, prompt ms and tok/s,
completion tokens, generation ms, `tpot_ms`, `tokens_per_s`), `hardware` (peak VRAM, peak RSS, mean GPU util, GPU
energy J…), `energy_per_token_j` (**GPU only**), `runtime`, `generation_params`, `model` (id, quant, fingerprint),
`load`, `timeline`, `measured_at`.

Stopping: `POST /chat/stop` **or** closing the connection; the engine stops reading and llama-server aborts the task.
A stopped answer keeps its partial text (`status: "stopped"`); llama.cpp's own counts are then `null`.
Only one generation runs at a time (`409 BUSY`).

### Compare Configurations

`CompareRequest = { prompt, system_prompt?, generation (default temperature 0, seed 42), configs: 2–4 × { label, model_id,
runtime }, warmup_runs (0–5), repetitions (1–20), confirm }`. Per configuration: unload → baseline VRAM → load →
warm-ups (discarded) → measured runs with **prompt cache disabled**. `results`:

- `configs[]`: `stats[metric] = { median, p25, p75, min, max, std, n }`, raw `runs`, `placement`, `load_time_s`,
  `vram_resident_bytes`, `output_sample`, `deterministic_output`;
- `comparison[metric] = { medians, best, reference, vs_reference: { label: { absolute, percent } } }` — best **per metric**,
  never an overall winner;
- `metrics` (direction/label/unit), `protocol`, `hardware`, `backend`, `quality: { evaluated: false, note }`, `notes`.

Metrics: `gen_tokens_per_s`, `prompt_tokens_per_s`, `ttft_ms`, `tpot_ms`, `total_ms`, `peak_vram_over_baseline_bytes`,
`peak_rss_bytes`, `mean_gpu_util`, `gpu_energy_per_token_j`.

## 9. Not implemented in v0.1 (contract reserved)

| Feature | Behaviour |
|---|---|
| Structured pruning | not exposed; internal call → `501 NOT_IMPLEMENTED` |
| PyTorch engine | listed in `/system/health` as unavailable or `bench: false` |
| GSM8K / ARC / MMLU accuracy | not produced; only perplexity |
| Writing optimized model files from `/optimization/start` | `optimization_applied` is always `false` |
| Speculative decoding measurement | compatibility check exists in the engine, no endpoint yet |
| Push updates (WebSocket/SSE) | poll job endpoints instead |
