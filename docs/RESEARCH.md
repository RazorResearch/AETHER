# AETHER — Research Journal

Rules of this journal: hypotheses are stated as hypotheses; every result states its conditions and limits;
nothing is called a discovery before validation against prior work and output-space measurements.
Bibliographic references below are listed from the authors' knowledge and **must be verified** (exact titles,
venues, years) before any publication.

---

## R-001 — Layer/tensor-wise adaptive bit allocation

- **Status:** prototype implemented, proxy results on synthetic data only (2026-11-18).
- **Hypothesis:** at equal memory budget, allocating quantization types per tensor according to measured
  sensitivity yields lower quality loss than a uniform preset.
- **Prior work (to verify):**
  - Shoham & Gersho (1988), efficient bit allocation for an arbitrary set of quantizers — the classical
    rate–distortion / Lagrangian allocation our greedy follows.
  - HAQ (Wang et al., CVPR 2019) — RL-searched mixed precision under hardware budgets.
  - HAWQ, HAWQ-V2, HAWQ-V3 (Dong, Yao et al., 2019–2021) — Hessian-aware sensitivity, ILP allocation.
  - GPTQ (Frantar et al., 2022), AWQ (Lin et al., 2023), SqueezeLLM (Kim et al., 2023), SpQR
    (Dettmers et al., 2023) — post-training LLM quantization using second-order or activation-aware saliency.
  - llama.cpp K-quant mixes (Q4_K_M etc. upgrade `attn_v`/`ffn_down`), importance matrix (imatrix), and
    `--tensor-type` overrides; community "dynamic" GGUF quants that select per-layer types.
  - Conclusion so far: per-layer/per-tensor mixed precision is **well established**. AETHER's possible
    contribution is engineering (a reproducible, budget-driven pipeline on consumer GPUs with measured
    validation), not the idea itself.
- **Protocol:** see EXP-001 in [EXPERIMENTS.md](EXPERIMENTS.md).
- **Next steps:** (1) run on a 0.5B–1.5B F16 model; (2) imatrix-weighted error; (3) output-space validation
  with llama-quantize `--tensor-type` + perplexity at matched file size against Q3_K_M / Q4_K_M / Q5_K_M.

## R-002 — KV cache quantization on 8 GB GPUs

- **Status:** measurement pipeline ready (`kv_cache_comparison`), not yet run on hardware.
- **Hypothesis:** q8_0 K/V caches halve KV memory with negligible perplexity change; q4_0 V cache degrades
  more than q4_0 K cache for long contexts. (To be measured; literature suggests keys are more sensitive
  in some settings — this must be checked per model.)
- **Prior work (to verify):** KIVI (Liu et al., 2024), KVQuant (Hooper et al., 2024), H2O (Zhang et al.,
  2023), StreamingLLM (Xiao et al., 2023), SnapKV (Li et al., 2024), PagedAttention / vLLM (Kwon et al., 2023);
  llama.cpp `-ctk/-ctv` + flash attention.
- **Protocol:** EXP-003.

## R-003 — Memory placement model calibration

- **Status:** analytical model implemented; uncalibrated.
- **Hypothesis:** a linear correction on the compute-buffer and context-overhead terms predicts peak VRAM
  within ±5 % across 0.5B–8B models on the reference GPU.
- **Protocol:** EXP-002.

## R-004 — Speculative decoding on consumer GPUs

- **Status:** compatibility checker only.
- **Prior work (to verify):** Leviathan et al. (2023) and Chen et al. (2023) speculative sampling; Medusa
  (Cai et al., 2024); EAGLE (Li et al., 2024); llama.cpp `llama-speculative` and server draft models.
- **Open question:** with 8 GB VRAM, is the VRAM cost of a resident draft model better spent on a higher
  precision target or longer context? Requires measured tokens/s and quality at equal VRAM.

---

## Log

| Date | Entry |
|---|---|
| 2026-11-18 | GGUF reader validated byte-exact on two real files (Qwen2.5-1.5B Q4_K_M, Qwen3-8B IQ4_XS). |
| 2026-11-18 | Preset size estimator measured −10.5 % on Qwen2.5-1.5B Q4_K_M (expected bias, documented). |
| 2026-11-18 | EXP-001 pipeline run on synthetic Gaussian weights (pipeline check, not a result). |
