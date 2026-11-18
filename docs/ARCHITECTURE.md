# AETHER Engine — Architecture

## 1. Scope and separation from the frontend

The repository hosts two independent codebases:

| Area | Owner | Paths |
|---|---|---|
| Frontend (React/TS, Vite, Tailwind) | frontend team | `src/`, `index.html`, `package.json`, `vite.config.ts`, `tailwind.config.js`, … |
| Engine (Python) | engine team | `backend/`, `docs/` (these six documents) |

The only coupling is the REST API documented in [API_CONTRACT.md](API_CONTRACT.md). The engine never reads,
imports or modifies frontend files; the frontend never imports Python code.

## 2. Layout

```
backend/
├── app/
│   ├── main.py                 FastAPI app factory, error envelope, CORS
│   ├── cli.py                  `serve`, `hardware`, `analyze` commands
│   ├── api/
│   │   ├── routes/             system, models, experiments, benchmarks, activity, optimization
│   │   ├── schemas/            public Pydantic schemas (the contract)
│   │   └── deps.py             dependency injection from app.state.services
│   ├── core/
│   │   ├── config.py           Settings from AETHER_* env vars (no config in the DB)
│   │   ├── errors.py           typed errors with stable codes + HTTP status
│   │   ├── hardware.py         Hardware Analyzer (NVML, psutil, optional torch)
│   │   ├── analyzer.py         ModelInspector interface; GGUF + Safetensors inspectors
│   │   ├── model_manager.py    library: import/scan/remove, fingerprints
│   │   └── optimizer.py        Pareto front + profile ranking
│   ├── formats/                gguf.py (reader/writer), safetensors.py, detect.py (magic bytes)
│   ├── engines/
│   │   ├── base.py             InferenceEngine ABC, RuntimeParams, BenchResult…
│   │   ├── llamacpp.py         subprocess adapter: llama-bench/perplexity/quantize/imatrix
│   │   ├── llama_server.py     resident llama-server runtime (load/unload, SSE client, measured placement)
│   │   ├── live_sampler.py     timestamped NVML/psutil sampling during generation
│   │   ├── monitor.py          per-process peak RAM, VRAM, GPU energy sampling
│   │   └── pytorch.py          optional engine (explicitly not implemented for inference)
│   ├── optimizations/
│   │   ├── quantization/       types (ggml table), sensitivity, allocator, planner
│   │   ├── kv_cache/           analytical KV footprint, strategy comparison
│   │   ├── memory/             VRAM/RAM placement planner, OOM/swap risk
│   │   ├── speculative/        draft/target compatibility + llama.cpp flags
│   │   └── pruning/            reserved (raises NOT_IMPLEMENTED)
│   ├── benchmarks/             records (reproducibility + comparability), runner, quality evaluators
│   ├── experiments/registry.py experiment types, config schemas, runners, cost classes
│   ├── database/db.py          SQLite + versioned migrations + generic CRUD
│   └── services/               container, jobs, activity, benchmarks, experiments, optimization,
│                               chat (sessions + SSE generation), chat_profiles, chat_compare
├── tests/                      pytest suite, synthetic GGUF builder, fake llama.cpp tools
├── scripts/run_exp001.py       reproducible research script
├── pyproject.toml / requirements.txt
```

Deviation from the initial plan: `formats/` was added (format parsing is shared by the analyzer, the
quantization research and the model manager), and `engines/monitor.py` isolates resource measurement.

## 3. Request flow

```
HTTP → routes → service (validation, persistence, activity log)
                  ├─ fast path: core/optimizations modules → response
                  └─ slow path: JobManager.submit(fn) → 202 + job id
                                   worker thread (1 by default) → engine subprocess (llama.cpp)
                                   → ProcessMonitor (RAM/VRAM/energy) → result persisted → on_done hook
```

## 4. Key design decisions

1. **Wrap llama.cpp, do not re-implement it.** Speed, perplexity, quantization and imatrix use the upstream
   tools via subprocess. This keeps us on their tested kernels and lets us measure, then improve.
2. **Honesty by construction.** Every value is `null` if not read; derived values are labelled
   (`provenance`, `basis`, `is_estimate`, `validated`); missing tools raise `ENGINE_UNAVAILABLE`.
   A completed job never implies an applied/validated optimization.
3. **One heavy job at a time** (`max_concurrent_jobs=1`), sized for 8 GB VRAM / 16 GB RAM. Subprocesses
   release GPU memory on exit, so no model stays resident in the API process.
4. **Expensive operations require explicit consent** (`confirm: true`), surfaced as
   `409 CONFIRMATION_REQUIRED`. Nothing is downloaded by the engine.
5. **Pure-Python GGUF reader** (no dependency) — validated byte-exact against two real files
   (Qwen2.5-1.5B Q4_K_M, Qwen3-8B IQ4_XS): computed tensor extents equal the file size.
6. **SQLite via stdlib**, forward-only migrations in `database/db.py::MIGRATIONS`, JSON columns for
   evolving payloads. Configuration lives in env vars; experimental data in the DB; weights on disk only.
7. **Tests without hardware**: fake llama.cpp tools (Python scripts emitting the real output formats),
   injected hardware snapshots (CPU-only and GPU), synthetic GGUF models with real ggml layouts.

## 4b. Interactive inference (Chat)

```
UI --POST /chat/generate (SSE)--> ChatService -- worker thread --> LlamaServerRuntime --HTTP stream--> llama-server
 ^                                    |                                (127.0.0.1, free port, -lv 4 log parsed)
 +-- session/status/token/metrics/done events <-- queue <-- LiveSampler (NVML/psutil, 250 ms)
```

One model is resident at a time (8 GB VRAM). The llama-server child is bound to the engine's lifetime (Windows Job
Object with KILL_ON_JOB_CLOSE, Linux PDEATHSIG), so a crashed engine never leaves VRAM allocated (verified by
hard-killing the parent). Stopping closes the HTTP stream, which aborts the llama.cpp task. Comparisons run through
the job queue and never overlap a chat generation (`BUSY`).

## 5. Configuration

| Variable | Default | Purpose |
|---|---|---|
| `AETHER_DATA_DIR` | `~/.aether` | database + artifacts (quantized files, results) |
| `AETHER_DB_PATH` | `$AETHER_DATA_DIR/aether.db` | SQLite file |
| `AETHER_MODEL_DIRS` | — | `os.pathsep`-separated directories for `POST /models/scan` |
| `AETHER_LLAMACPP_DIR` | newest `backend/vendor/llama.cpp/*` | llama.cpp build dir (`bin/`, `build/bin/` are searched), else `PATH` |
| `AETHER_CORS_ORIGINS` | Vite dev + Tauri | comma-separated allowed origins |

## 6. Database schema (migration 1)

`models`, `hardware_profiles`, `experiments`, `benchmarks`, `optimization_jobs`, `activity_logs`,
plus `schema_migrations`. Migration 2 adds `chat_sessions`, `chat_messages` (metrics stored per answer),
`chat_profiles`, `chat_comparisons`. To change the schema, append `(version, description, sql)` to `MIGRATIONS`;
never edit an applied migration.

## 7. Dependencies and licences

| Package | Licence | Required |
|---|---|---|
| fastapi, pydantic | MIT | yes |
| uvicorn, psutil, numpy, nvidia-ml-py | BSD-3-Clause | yes |
| httpx | BSD-3-Clause | yes (llama-server client) |
| pytest (MIT) | — | tests |
| react-markdown, remark-gfm, rehype-highlight (frontend) | MIT | yes |
| llama.cpp | MIT | runtime tool, not vendored |
| torch (BSD-3), lm-eval (MIT) | — | optional |

All are compatible with Apache-2.0. No proprietary service is required; NVML ships with the NVIDIA driver
and is optional.
