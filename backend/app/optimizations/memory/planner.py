"""Memory planner: VRAM / RAM split estimation and OOM-risk detection for llama.cpp.

Model of llama.cpp placement (default ``offload_kqv=true``, mmap enabled):
* repeating layers ``blk.i`` with ``i >= n_layers - n_gpu_layers`` go to GPU;
* the output head goes to GPU only when ``n_gpu_layers > n_layers``;
* ``token_embd`` stays in host memory;
* the KV cache of an offloaded layer lives on GPU, otherwise in RAM;
* a compute buffer and a CUDA context overhead are added on GPU.

The compute-buffer term is a *heuristic* (labelled as such in the output);
it must be calibrated against measured peaks (see docs/EXPERIMENTS.md, EXP-002).
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.core.analyzer import ModelAnalysis
from app.optimizations.kv_cache.estimator import estimate_kv_cache

GiB = 1024**3


class MemoryBudget(BaseModel):
    vram_available_bytes: int | None = Field(None, description="Free VRAM; None = no usable GPU.")
    ram_available_bytes: int
    vram_safety_margin_bytes: int = 512 * 1024**2
    ram_safety_margin_bytes: int = 1536 * 1024**2
    cuda_context_overhead_bytes: int = 400 * 1024**2


class PlacementEstimate(BaseModel):
    n_gpu_layers: int
    n_ctx: int
    cache_type_k: str
    cache_type_v: str
    flash_attn: bool
    gpu_weights_bytes: int
    cpu_weights_bytes: int
    gpu_kv_bytes: int
    cpu_kv_bytes: int
    compute_buffer_bytes: int
    gpu_overhead_bytes: int
    vram_total_bytes: int
    ram_total_bytes: int
    fits_vram: bool | None
    fits_ram: bool
    oom_risk: str = Field(description="none | low | medium | high | will_not_fit")
    swap_risk: bool
    assumptions: list[str]


class MemoryPlan(BaseModel):
    recommended: PlacementEstimate | None
    candidates: list[PlacementEstimate]
    reason: str
    warnings: list[str] = []


def _compute_buffer(a: ModelAnalysis, n_ctx: int, flash_attn: bool, n_ubatch: int = 512) -> int:
    ar = a.architecture
    vocab = ar.vocab_size or 32000
    embd = ar.embedding_length or 4096
    heads = ar.n_heads or 32
    attn = 0 if flash_attn else heads * min(n_ctx, 1 << 20)
    return int(n_ubatch * (vocab + 8 * embd + attn) * 4)


def estimate_placement(a: ModelAnalysis, budget: MemoryBudget, n_gpu_layers: int, n_ctx: int,
                       cache_type_k: str = "f16", cache_type_v: str = "f16",
                       flash_attn: bool = True) -> PlacementEstimate:
    n_layers = a.architecture.n_layers or len(a.layers)
    if not a.layers or n_layers == 0:
        raise ValueError("analysis has no per-layer information; cannot plan placement")
    gpu_layers = max(0, min(n_gpu_layers, n_layers + 1))
    if budget.vram_available_bytes is None:
        gpu_layers = 0
    first_gpu = n_layers - min(gpu_layers, n_layers)
    gpu_w = sum(L.nbytes or 0 for L in a.layers if L.index >= first_gpu)
    cpu_w = sum(L.nbytes or 0 for L in a.layers if L.index < first_gpu)
    for g in a.non_layer_tensors:
        on_gpu = gpu_layers > n_layers and g.name.startswith(("output", "output_norm"))
        if on_gpu:
            gpu_w += g.nbytes or 0
        else:
            cpu_w += g.nbytes or 0
    kv = estimate_kv_cache(a.architecture, n_ctx, cache_type_k, cache_type_v)
    gpu_kv = kv.per_layer_bytes * min(gpu_layers, n_layers)
    cpu_kv = kv.total_bytes - gpu_kv
    compute = _compute_buffer(a, n_ctx, flash_attn)
    overhead = budget.cuda_context_overhead_bytes if gpu_layers > 0 else 0
    vram = gpu_w + gpu_kv + (compute + overhead if gpu_layers > 0 else 0)
    ram = cpu_w + cpu_kv + (compute if gpu_layers == 0 else compute // 4)
    fits_ram = ram + budget.ram_safety_margin_bytes <= budget.ram_available_bytes
    if budget.vram_available_bytes is None:
        fits_vram = None
        vram_ratio = 0.0
    else:
        fits_vram = vram + budget.vram_safety_margin_bytes <= budget.vram_available_bytes
        vram_ratio = vram / max(budget.vram_available_bytes, 1)
    ram_ratio = ram / max(budget.ram_available_bytes, 1)
    worst = max(vram_ratio, ram_ratio)
    if (fits_vram is False and vram_ratio > 1) or ram_ratio > 1:
        risk = "will_not_fit"
    elif fits_vram is False or not fits_ram:
        risk = "high"
    elif worst > 0.85:
        risk = "medium"
    elif worst > 0.7:
        risk = "low"
    else:
        risk = "none"
    assumptions = [
        "compute buffer is a heuristic (ubatch=512), not a measurement",
        f"CUDA context overhead assumed {budget.cuda_context_overhead_bytes // 1024**2} MiB",
        "weights in RAM are mmapped: counted as required resident memory to avoid page thrashing",
    ]
    assumptions += kv.notes
    return PlacementEstimate(
        n_gpu_layers=gpu_layers, n_ctx=n_ctx, cache_type_k=cache_type_k, cache_type_v=cache_type_v,
        flash_attn=flash_attn, gpu_weights_bytes=gpu_w, cpu_weights_bytes=cpu_w, gpu_kv_bytes=gpu_kv,
        cpu_kv_bytes=cpu_kv, compute_buffer_bytes=compute, gpu_overhead_bytes=overhead,
        vram_total_bytes=vram, ram_total_bytes=ram, fits_vram=fits_vram, fits_ram=fits_ram,
        oom_risk=risk, swap_risk=not fits_ram, assumptions=assumptions)


def plan_memory(a: ModelAnalysis, budget: MemoryBudget, n_ctx: int, cache_type_k: str = "f16",
                cache_type_v: str = "f16", flash_attn: bool = True) -> MemoryPlan:
    """Find the largest ``n_gpu_layers`` that fits VRAM (and RAM) with margins."""
    n_layers = a.architecture.n_layers or len(a.layers)
    warnings: list[str] = []
    if cache_type_v not in ("f16", "f32", "bf16") and not flash_attn:
        warnings.append("quantized V cache needs flash attention; enabling flash_attn in the plan")
        flash_attn = True
    candidates = [estimate_placement(a, budget, n, n_ctx, cache_type_k, cache_type_v, flash_attn)
                  for n in range(0, n_layers + 2)]
    if budget.vram_available_bytes is None:
        best = candidates[0]
        reason = "No usable GPU detected: CPU-only placement."
        if not best.fits_ram:
            return MemoryPlan(recommended=None, candidates=[best], reason="Model does not fit in available RAM.",
                              warnings=warnings + ["consider a smaller quantization or a shorter context"])
        return MemoryPlan(recommended=best, candidates=[best], reason=reason, warnings=warnings)
    fitting = [c for c in candidates if c.fits_vram and c.fits_ram]
    if not fitting:
        return MemoryPlan(recommended=None, candidates=candidates[:1] + candidates[-1:],
                          reason="No n_gpu_layers value fits both VRAM and RAM budgets.",
                          warnings=warnings + ["reduce context length, quantize the KV cache or use a smaller model"])
    best = max(fitting, key=lambda c: c.n_gpu_layers)
    if best.n_gpu_layers >= n_layers + 1:
        reason = "Full GPU offload fits within the VRAM budget."
    elif best.n_gpu_layers == n_layers:
        reason = "All repeating layers fit on GPU; the output head stays in RAM."
    else:
        reason = f"Partial offload: {best.n_gpu_layers}/{n_layers} layers on GPU; the rest runs from RAM."
    return MemoryPlan(recommended=best, candidates=fitting[-3:], reason=reason, warnings=warnings)
