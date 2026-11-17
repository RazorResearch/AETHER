# AETHER — Optimization Methods

Status legend: **Integrated** (uses an existing tool, measured by AETHER) · **Estimated** (analytical model,
not a measurement) · **Prototype** (AETHER research code, proxy-validated only) · **Planned**.

| Method | Status | Module |
|---|---|---|
| GGUF quantization presets (Q2_K…Q8_0, IQ4_XS) | Integrated (llama-quantize) | `engines/llamacpp.py`, `experiments/registry.py` |
| Importance matrix | Integrated (llama-imatrix), not yet used by an experiment end-to-end | `engines/llamacpp.py` |
| Per-tensor type overrides | Integrated (llama-quantize `--tensor-type`, recent builds) | `LlamaCppEngine.quantize` |
| Preset size estimate | Estimated | `quantization/planner.py` |
| Adaptive bit allocation | Prototype | `quantization/sensitivity.py`, `allocator.py` |
| KV cache quantization (`-ctk/-ctv`) | Integrated (llama-bench) + Estimated footprint | `kv_cache/estimator.py` |
| CPU/GPU layer placement | Estimated | `memory/planner.py` |
| Speculative decoding | Compatibility check only | `speculative/compat.py` |
| Structured pruning | Planned (raises NOT_IMPLEMENTED) | `pruning/` |
| Multi-objective selection | Implemented (Pareto + weighted profiles) | `core/optimizer.py` |

---

## 1. Exact tensor sizes (ggml type table)

`size = n_elements / block_size × type_size`, with `(block_size, type_size)` from ggml's type traits
(e.g. Q4_K = 256 / 144 bytes = 4.5 bpw, Q6_K = 256 / 210 = 6.5625 bpw, Q8_0 = 32 / 34 = 8.5 bpw).
Validation: for two real GGUF files the sum of computed extents equals the file size to the byte.

## 2. Preset size estimate — Estimated

`Σ layer_params × bpw(dominant type) + non-layer tensors` (norms in F32). Known bias: real presets keep some
tensors at higher precision. Measured on Qwen2.5-1.5B-Instruct: estimate for Q4_K_M = 999.6 MB, actual file
= 1117.3 MB (**−10.5 %**). Use only for ordering presets and disk pre-checks (10 % margin applied).

## 3. KV cache footprint — Estimated (exact for dense attention)

```
bytes/token = Σ_layers n_kv_heads(l) × (key_length × bytes(ctk) + value_length × bytes(ctv))
```

`bytes(q8_0) = 34/32`, `bytes(q4_0) = 18/32`, etc. Exact for dense MHA/GQA in llama.cpp's unified cache.
Flagged as upper bound for SWA, MLA, recurrent/hybrid architectures (`KV_NON_STANDARD_ARCHS`).
Quantized V cache requires flash attention in llama.cpp. Quality impact is **not** estimated; it must be
measured (perplexity) — see EXP-003.

## 4. Memory placement planner — Estimated

Model of llama.cpp placement: the last `n_gpu_layers` repeating blocks on GPU, the output head on GPU only
when `n_gpu_layers > n_layers`, `token_embd` in host memory, the KV cache follows its layer, plus a compute
buffer and a CUDA context overhead.

- Compute buffer heuristic: `ubatch × (n_vocab + 8·n_embd + [n_head·n_ctx if no flash-attn]) × 4 bytes`.
- CUDA context overhead: 400 MiB (configurable).
- Safety margins: 512 MiB VRAM, 1.5 GiB RAM.
- OOM risk: `will_not_fit` (>100 % of budget), `high` (fits only without margin), `medium` (>85 %),
  `low` (>70 %), `none`.

Limits: both heuristics are uncalibrated. EXP-002 will fit them against measured peaks.

## 5. Adaptive bit allocation — Prototype

**Hypothesis.** Tensors differ in sensitivity to quantization; at an equal memory budget, a per-tensor
allocation can reduce quantization error versus a uniform type.

**Sensitivity (proxy).** For each 2-D weight tensor and bit-width `b`, relative error of a simulated blockwise
(32) symmetric absmax round-to-nearest quantizer: `‖W − Q_b(W)‖² / ‖W‖²`, computed on up to 4096 random rows
(deterministic seed) from an F16/BF16/F32 GGUF via memory mapping.

**Allocation.** Multiple-choice knapsack: minimise `Σ n_params_i · err_i(t_i)` s.t. `Σ bytes_i(t_i) ≤ budget`,
with real ggml sizes for `t ∈ {Q2_K, Q3_K, Q4_K, Q5_K, Q6_K, Q8_0}` (block-32 fallbacks when a row is not a
multiple of 256). Solver: marginal-gain greedy on each tensor's lower convex hull; an exact DP is used in tests
to bound the greedy gap. Output: `--tensor-type` overrides for llama-quantize.

**Known limits.**
- Weight-space error ignores activations and the effect on the loss (no calibration data). An
  imatrix-weighted variant is the next step (llama.cpp's imatrix already provides per-column activation
  statistics).
- The simulated quantizer is not a K-quant: absolute errors differ; only *relative* sensitivity is used.
- The `n_params`-weighted objective treats every parameter as equally important across tensors — known to be
  false (e.g. `attn_v`, `ffn_down` are treated specially by llama.cpp presets).
- No claim of novelty: this is a classic rate–distortion allocation; see [RESEARCH.md](RESEARCH.md).

## 6. Multi-objective selection

Objectives: quality (max), speed (max), memory (min), energy (min). Each metric carries a `basis`
(`measured | estimated | proxy`). Selection: Pareto front over objectives available on all candidates, then a
min–max normalised weighted score per profile. Rules: ranking on memory alone is refused (spec: never select
on size only); a candidate is `validated` only if every objective used was measured.

## 7. Measurement methods

| Metric | Method | Caveat |
|---|---|---|
| tokens/s (pp, tg) | llama-bench, `-r` repetitions, mean ± std, all samples kept | — |
| TTFT | derived: `n_prompt / pp_ts + 1 / tg_ts` | not a wall-clock measurement |
| Peak RAM | RSS of process tree sampled every 50 ms | short spikes < 50 ms may be missed |
| Peak VRAM | NVML per-process if exposed, else device used − baseline (`device_delta`) | `device_delta` includes other processes; on Windows WDDM per-process values are usually unavailable |
| Energy | NVML total energy counter delta (mJ) over the run | device-level; idle and other processes included |
| Perplexity | llama-perplexity "Final estimate" ± uncertainty | dataset, context and chunks recorded |
| Stability | coefficient of variation of samples | — |
