# AETHER Engine — Roadmap

## Done in v0.1 (branch `feature/aether-engine`)

**Priority 1 — infrastructure**
- [x] Hardware Analyzer: NVML GPU (name, VRAM total/free, utilisation, temperature, power, compute capability,
      energy counter), CPU (model, cores, per-core load), RAM/swap, disks, driver + CUDA versions; CPU-only safe
- [x] Model Manager: import by path, directory scan, GGUF + Safetensors detection, metadata, fingerprints
- [x] Model Analyzer: architecture, per-layer params/bytes/types, quantization mix, exact bpw, provenance
- [x] FastAPI API with every contract endpoint, uniform error envelope, background jobs, OpenAPI
- [x] SQLite with versioned migrations; activity log

**Priority 2 — llama.cpp engine & reference benchmarks**
- [x] llama.cpp adapter (bench, perplexity, quantize, imatrix) with peak RAM/VRAM/energy monitoring
- [x] Reproducible benchmark records + comparability checks
- [ ] Run reference benchmarks on the RTX 5060 (needs a llama.cpp CUDA build — see below)

**Priority 3 — quantization research**
- [x] Weight-space sensitivity proxy, greedy + exact allocators, `--tensor-type` export
- [x] EXP-001 pipeline (synthetic check)
- [ ] EXP-001 on a real F16 model, then output-space validation (perplexity at matched size)

**Priority 4 — KV cache & memory**
- [x] KV footprint estimator, placement planner, OOM/swap risk
- [x] `kv_cache_comparison` experiment
- [ ] EXP-002 calibration, EXP-003 measurements

**Priority 5 — acceleration & multi-objective**
- [x] Pareto front + profiles with measured/estimated/proxy basis
- [x] Speculative decoding compatibility check
- [ ] Measured speculative decoding (llama-speculative / llama-server draft)

**Chat & live inference (2026-11-18)**
- [x] llama-server runtime, SSE streaming, stop, regenerate, edit & resubmit, persisted conversations
- [x] Live metrics (tok/s, TTFT, TPOT, prefill, GPU/VRAM/temp/power, CPU/RAM, measured layer split) and charts
- [x] Profiles and hardware-aware presets; Compare Configurations with warm-up, repetitions, medians, p25–p75
- [ ] Quality evaluation in comparisons (perplexity on a local text, lm-evaluation-harness through llama-server)
- [ ] Multiple slots / concurrent sessions (one generation at a time by design today)

**Priority 6 — frontend integration**
- [x] `docs/API_CONTRACT.md` with field mappings to the frontend types
- [ ] Frontend team replaces simulated telemetry with `GET /system/hardware`

## Next

1. ~~Install llama.cpp with CUDA~~ — done: official b12484 CUDA 13.5 build in `backend/vendor/` (checksums verified).
2. Reference benchmarks for 0.5B / 1.5B / 3B models (Q4_K_M, Q8_0) — establish the baseline.
3. Imatrix-weighted sensitivity; output-space validation of R-001.
4. `llama-server` lifecycle management → lm-evaluation-harness (GSM8K, ARC, MMLU), French comprehension set
   (dataset and licence to be chosen), coding tests in a sandbox.
5. Calibrated memory planner; dynamic context sizing to prevent OOM.
6. Server-sent events for job progress (optional; polling works today).
7. Safetensors → GGUF conversion via llama.cpp `convert_hf_to_gguf.py` (explicit user action).
8. Optional PyTorch engine for activation statistics on Safetensors models.

## Non-goals for now

- Modifying llama.cpp CUDA kernels (only with measurements, tests and documentation).
- Downloading models or datasets automatically.
- Any claim of a new method before prior-work review and validated measurements.
