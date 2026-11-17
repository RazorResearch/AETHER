"""KV cache footprint estimation.

Dense attention formula (per token, per layer):
    K: n_kv_heads * key_length   elements
    V: n_kv_heads * value_length elements
bytes = elements * bytes_per_element(cache_type)

This is exact for standard dense GQA/MHA transformers in llama.cpp (unified
KV cache, no SWA). For architectures in ``KV_NON_STANDARD_ARCHS`` the result is
an approximate upper bound and is flagged.
"""

from __future__ import annotations

from pydantic import BaseModel

from app.core.analyzer import KV_NON_STANDARD_ARCHS, ArchitectureInfo
from app.optimizations.quantization.types import KV_CACHE_TYPES, kv_bytes_per_element


class KVEstimate(BaseModel):
    n_ctx: int
    cache_type_k: str
    cache_type_v: str
    bytes_per_token: int
    total_bytes: int
    per_layer_bytes: int
    exact_for_architecture: bool
    notes: list[str] = []


def _kv_heads(arch: ArchitectureInfo, layer: int) -> int:
    kv = arch.n_kv_heads
    if isinstance(kv, list):
        return int(kv[layer]) if layer < len(kv) else int(kv[-1])
    return int(kv)


def estimate_kv_cache(arch: ArchitectureInfo, n_ctx: int, cache_type_k: str = "f16",
                      cache_type_v: str = "f16") -> KVEstimate:
    missing = [f for f in ("n_layers", "n_kv_heads", "key_length", "value_length") if getattr(arch, f) is None]
    if missing:
        raise ValueError(f"cannot estimate KV cache, missing architecture fields: {missing}")
    for t in (cache_type_k, cache_type_v):
        if t not in KV_CACHE_TYPES:
            raise ValueError(f"unsupported KV cache type {t!r}; expected one of {KV_CACHE_TYPES}")
    bk, bv = kv_bytes_per_element(cache_type_k), kv_bytes_per_element(cache_type_v)
    per_token = 0.0
    for layer in range(arch.n_layers):
        h = _kv_heads(arch, layer)
        per_token += h * arch.key_length * bk + h * arch.value_length * bv
    notes = []
    exact = arch.architecture not in KV_NON_STANDARD_ARCHS
    if not exact:
        notes.append("non-standard KV layout (SWA/MLA/recurrent): value is an upper bound")
    if cache_type_v not in ("f16", "f32", "bf16"):
        notes.append("quantized V cache requires flash attention in llama.cpp (-fa)")
    total = int(per_token * n_ctx)
    return KVEstimate(n_ctx=n_ctx, cache_type_k=cache_type_k, cache_type_v=cache_type_v,
                      bytes_per_token=int(per_token), total_bytes=total,
                      per_layer_bytes=total // max(arch.n_layers, 1), exact_for_architecture=exact, notes=notes)


def compare_kv_strategies(arch: ArchitectureInfo, n_ctx: int,
                          pairs: list[tuple[str, str]] | None = None) -> list[KVEstimate]:
    pairs = pairs or [("f16", "f16"), ("q8_0", "q8_0"), ("q8_0", "q4_0"), ("q4_0", "q4_0")]
    return [estimate_kv_cache(arch, n_ctx, k, v) for k, v in pairs]
