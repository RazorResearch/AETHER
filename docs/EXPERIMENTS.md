# AETHER — Experiments

Every experiment records: model identity (id, fingerprint, quantization), parameters, hardware profile,
engine version, date, repetitions and raw results (see `BenchmarkRecord`). Results obtained under different
conditions are not compared without `GET /benchmarks/compare` reporting the differences.

Cost classes: *cheap* (seconds, CPU), *moderate* (minutes, CPU/disk reads), *expensive* (GPU inference,
quantization, multi-GB writes — requires explicit confirmation).

---

## EXP-001 — Adaptive bit allocation vs uniform (weight-space proxy)

- **Research item:** R-001 · **Type:** `quantization_sensitivity` · **Cost:** moderate (CPU only)
- **Question:** at equal bytes, does greedy per-tensor allocation reduce the proxy distortion versus the best
  uniform type that fits?
- **Protocol:**
  1. Source: an unquantized (F16/BF16) GGUF of a 0.5B–3B model.
  2. Sensitivity: simulated RTN error for b ∈ {2,3,4,5,6,8} on ≤ 4096 sampled rows per tensor (seed 0).
  3. Budgets: 3.5 / 4.5 / 5.5 bits per weight over quantizable tensors.
  4. Compare greedy allocation with the lowest-distortion uniform allocation within each budget.
  5. Validation (not yet run): quantize with `llama-quantize --tensor-type` overrides and with the closest
     preset at the same file size; measure perplexity (same dataset, context, chunks) and tokens/s.
- **Reproduce:** `python backend/scripts/run_exp001.py --model model-F16.gguf --out results/exp001.json`
  or through the API (`POST /experiments` with type `quantization_sensitivity`).

### Run 2026-11-18 — synthetic pipeline check (NOT a scientific result)

Conditions: 4-layer random llama (embd 256, ffn 512, i.i.d. Gaussian weights; layer-0 `attn_output` has a
larger scale, which does not change *relative* error), F16, all rows, aether-engine 0.1.0, CPU.

| Budget (bpw) | Adaptive bpw | Adaptive mix | Best uniform | Proxy distortion ratio |
|---|---|---|---|---|
| 3.5 | 3.498 | 28×Q3_K, 2×Q4_K | Q3_K (3.438 bpw) | 0.953 |
| 4.5 | 4.500 | 30×Q4_K | Q4_K | 1.000 |
| 5.5 | 5.500 | 30×Q5_K | Q5_K | 1.000 |

Interpretation: with near-identical weight statistics, adaptive allocation collapses to uniform, as expected;
the only gain (−4.7 % proxy distortion at 3.5 bpw) comes from spending budget left unused by the uniform
choice. The two tensors upgraded to Q4_K (`token_embd`, `blk.3.attn_q`) rank first by 3-bit error, but all
sensitivities are within 0.5 % of each other, so the choice is essentially arbitrary here. This validates the
pipeline, not the hypothesis. **Limit:** synthetic weights lack the outliers of real LLMs; no output-space metric.

**Next run:** a real F16 model (e.g. Qwen2.5-0.5B-Instruct F16 GGUF, ~1 GB). Not downloaded automatically —
requires the user to provide the file.

---

## EXP-002 — Memory placement model calibration

- **Research item:** R-003 · **Cost:** expensive (GPU)
- **Protocol:** for 3–4 models (0.5B, 1.5B, 3B, 8B Q4) × n_ctx ∈ {2k, 8k, 32k} × n_gpu_layers ∈ {0, half, all}:
  run llama-bench, record measured peak VRAM/RAM, compare with `estimate_placement`, fit the overhead terms.
- **Status:** not run. Note: on Windows (WDDM) per-process VRAM is usually unavailable (device delta only);
  the reference environment for this experiment is Linux.

## EXP-003 — KV cache quantization: memory, speed, perplexity

- **Research item:** R-002 · **Type:** `kv_cache_comparison` · **Cost:** expensive (GPU)
- **Protocol:** pairs (f16,f16), (q8_0,q8_0), (q8_0,q4_0), (q4_0,q4_0); n_ctx 4096 and 16384; 3 repetitions;
  perplexity on a fixed local text (e.g. wikitext-2 test, CC BY-SA) with identical context and chunks;
  flash attention on for every pair to isolate the cache-type effect.
- **Status:** not run (llama.cpp not installed on the reference machine at the time of writing).

## EXP-004 — GGUF preset comparison

- **Type:** `quantization_comparison` · **Cost:** expensive (GPU + disk)
- **Protocol:** from one F16 source, presets Q3_K_M, Q4_K_M, Q5_K_M, Q6_K, Q8_0 (with and without imatrix);
  record file size, tokens/s, peak memory, perplexity. Baseline for R-001 validation.
- **Status:** not run.
