"""Quantization planning on top of llama.cpp presets.

* ``estimate_preset_size`` — first-order size estimate of a preset from the
  current model (dominant type; real presets mix types: flagged as estimate).
* ``adaptive_experiment`` — runs the sensitivity proxy and compares adaptive
  allocations with uniform baselines at equal memory budgets.
"""

from __future__ import annotations

from pathlib import Path
from typing import Callable

from app.core.analyzer import ModelAnalysis
from app.optimizations.quantization.allocator import (build_choices, greedy_allocate,
                                                      uniform_allocation)
from app.optimizations.quantization.sensitivity import WeightSpaceProxy
from app.optimizations.quantization.types import PRESET_DOMINANT_TYPE, QUANT_PRESETS, ggml_type


def estimate_preset_size(a: ModelAnalysis, preset: str) -> dict:
    if preset not in PRESET_DOMINANT_TYPE:
        raise ValueError(f"unknown preset {preset}; known: {QUANT_PRESETS}")
    t = ggml_type(PRESET_DOMINANT_TYPE[preset])
    # norms/biases (1-D) stay F32 in llama.cpp
    total = 0
    for L in a.layers:
        total += int(L.n_params * t.bits_per_weight / 8)
    for g in a.non_layer_tensors:
        total += int(g.n_params * (4 if "norm" in g.name else t.bits_per_weight / 8))
    return {"preset": preset, "dominant_type": t.name, "estimated_bytes": total,
            "bits_per_weight": t.bits_per_weight, "is_estimate": True,
            "note": "first-order estimate: real presets keep some tensors at higher precision"}


def adaptive_experiment(source_gguf: Path, bits: list[int] = (2, 3, 4, 5, 6, 8),
                        budgets_bpw: list[float] = (3.5, 4.5, 5.5), max_rows: int | None = 4096,
                        progress: Callable[[float, str], None] | None = None) -> dict:
    """EXP-001: adaptive vs uniform allocation, measured on the weight-space proxy.

    Returns per-tensor sensitivities, and for each budget the greedy allocation
    and the best uniform baseline that fits the same budget.
    """
    prov = WeightSpaceProxy(max_rows=max_rows)
    sens = prov.measure(Path(source_gguf), list(bits),
                        progress=(lambda f, m: progress(0.85 * f, f"sensitivity {m}")) if progress else None)
    choices = build_choices(sens)
    n_params = sum(c.n_params for c in choices)
    uniforms = {b: uniform_allocation(choices, b) for b in bits}
    comparisons = []
    for bpw in budgets_bpw:
        budget = int(n_params * bpw / 8)
        adaptive = greedy_allocate(choices, budget)
        fitting = [u for u in uniforms.values() if u.total_bytes <= budget]
        baseline = min(fitting, key=lambda u: u.total_distortion) if fitting else None
        comparisons.append({
            "budget_bits_per_weight": bpw,
            "budget_bytes": budget,
            "adaptive": {"total_bytes": adaptive.total_bytes, "feasible": adaptive.feasible,
                         "bits_per_weight": adaptive.bits_per_weight(n_params),
                         "proxy_distortion": adaptive.total_distortion,
                         "type_histogram": _hist(adaptive.assignment),
                         "tensor_type_overrides": adaptive.tensor_type_overrides()},
            "best_uniform_within_budget": None if baseline is None else {
                "method": baseline.method, "total_bytes": baseline.total_bytes,
                "bits_per_weight": baseline.bits_per_weight(n_params),
                "proxy_distortion": baseline.total_distortion},
            "proxy_distortion_ratio": (adaptive.total_distortion / baseline.total_distortion
                                       if baseline and baseline.total_distortion else None),
        })
    if progress:
        progress(1.0, "done")
    return {
        "method": prov.method,
        "source": str(source_gguf),
        "n_quantizable_params": n_params,
        "candidate_bits": list(bits),
        "sensitivities": [s.model_dump() for s in sens],
        "comparisons": comparisons,
        "validated": False,
        "validation_note": "Proxy (weight-space) results only. Output-space validation (quantize with "
                           "llama-quantize --tensor-type and measure perplexity) has not been run.",
    }


def _hist(assignment: dict[str, str]) -> dict[str, int]:
    h: dict[str, int] = {}
    for t in assignment.values():
        h[t] = h.get(t, 0) + 1
    return h
