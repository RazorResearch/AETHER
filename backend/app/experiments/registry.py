"""Experiment types.

Each type declares its config schema, its cost class and a runner. Experiments
with ``cost == "expensive"`` (GPU inference, quantization, multi-GB writes)
require ``confirm: true`` when started (HTTP 409 CONFIRMATION_REQUIRED otherwise).
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Callable

from pydantic import BaseModel, Field

from app.benchmarks.records import BenchmarkSpec
from app.benchmarks.runner import run_benchmark
from app.core.errors import EngineUnavailableError, ResourceLimitError, ValidationFailed
from app.database.db import new_id, utcnow
from app.engines.base import BenchParams, RuntimeParams
from app.optimizations.kv_cache.estimator import estimate_kv_cache
from app.optimizations.quantization.planner import adaptive_experiment, estimate_preset_size
from app.optimizations.quantization.types import KV_CACHE_TYPES, QUANT_PRESETS
from app.services.container import Services
from app.services.jobs import JobContext


class QuantSensitivityConfig(BaseModel):
    model_id: str = Field(description="Unquantized (F16/BF16/F32) GGUF source model.")
    bits: list[int] = [2, 3, 4, 5, 6, 8]
    budgets_bits_per_weight: list[float] = [3.5, 4.5, 5.5]
    max_rows: int | None = Field(4096, description="Row subsample per tensor (None = all rows).")


class KVCacheComparisonConfig(BaseModel):
    model_id: str
    pairs: list[tuple[str, str]] = [("f16", "f16"), ("q8_0", "q8_0"), ("q4_0", "q4_0")]
    n_ctx: int = 4096
    n_prompt: int = 512
    n_gen: int = 128
    repetitions: int = 3
    n_gpu_layers: int = 99
    perplexity_dataset: str | None = None
    perplexity_chunks: int | None = 20


class QuantComparisonConfig(BaseModel):
    model_id: str = Field(description="Source model (F16/BF16 recommended).")
    presets: list[str] = ["Q4_K_M", "Q5_K_M", "Q8_0"]
    output_dir: str | None = Field(None, description="Defaults to <data_dir>/artifacts/quantized.")
    imatrix_path: str | None = None
    perplexity_dataset: str | None = Field(None, description="Local text file; required for quality.")
    perplexity_chunks: int | None = 20
    n_prompt: int = 512
    n_gen: int = 128
    repetitions: int = 3
    n_gpu_layers: int = 99


class ExperimentType(BaseModel):
    id: str
    name: str
    description: str
    cost: str  # cheap | moderate | expensive
    requires: list[str]
    config_schema: dict

    model_config = {"arbitrary_types_allowed": True}


Runner = Callable[[Services, dict, BaseModel, JobContext], dict]


def _model_path(s: Services, model_id: str) -> dict:
    m = s.models.get(model_id)
    if m["status"] != "available":
        raise ValidationFailed("Model file is missing on disk", details={"path": m["path"]})
    return m


def run_quant_sensitivity(s: Services, exp: dict, cfg: QuantSensitivityConfig, ctx: JobContext) -> dict:
    m = _model_path(s, cfg.model_id)
    if m["format"] != "gguf":
        raise ValidationFailed("Sensitivity proxy currently requires a GGUF model")
    try:
        return adaptive_experiment(Path(m["path"]), cfg.bits, cfg.budgets_bits_per_weight, cfg.max_rows,
                                   progress=lambda f, st: (ctx.check_cancelled(), ctx.progress(f, st)))
    except ValueError as exc:
        raise ValidationFailed(str(exc))


def _bench(s: Services, exp: dict, model: dict, params: BenchParams, ctx: JobContext,
           ppl: str | None, chunks: int | None, label: str, hw) -> dict:
    hw_id, snap = hw
    spec = BenchmarkSpec(model_id=model["id"], params=params, perplexity_dataset=ppl,
                         perplexity_chunks=chunks, experiment_id=exp["id"], label=label)
    rec = run_benchmark(spec, model, s.llamacpp, snap, hw_id, ctx.cancel)
    now = utcnow()
    s.db.insert("benchmarks", {"id": new_id("bench"), "model_id": model["id"], "experiment_id": exp["id"],
                               "hardware_profile_id": hw_id, "engine": s.llamacpp.name,
                               "engine_version": rec.engine_version, "status": "completed",
                               "spec": spec.model_dump(mode="json"), "record": rec.model_dump(mode="json"),
                               "job_id": ctx.job_id, "created_at": now, "updated_at": now})
    return rec.model_dump(mode="json")


def _require_llama(s: Services, *caps: str) -> None:
    st = s.llamacpp.status()
    missing = [c for c in caps if not st.capabilities.get(c)]
    if missing:
        raise EngineUnavailableError(f"llama.cpp capabilities missing: {missing}", details=st.model_dump())


def run_kv_comparison(s: Services, exp: dict, cfg: KVCacheComparisonConfig, ctx: JobContext) -> dict:
    _require_llama(s, "bench", *(["perplexity"] if cfg.perplexity_dataset else []))
    m = _model_path(s, cfg.model_id)
    analysis = s.models.analysis(m["id"])
    hw = s.record_hardware_profile()
    rows = []
    for i, (k, v) in enumerate(cfg.pairs):
        ctx.check_cancelled()
        ctx.progress(i / len(cfg.pairs), f"KV {k}/{v}")
        est = estimate_kv_cache(analysis.architecture, cfg.n_ctx, k, v)
        rt = RuntimeParams(n_gpu_layers=cfg.n_gpu_layers, cache_type_k=k, cache_type_v=v,
                           flash_attn=True if v not in ("f16", "f32", "bf16") else None)
        rec = _bench(s, exp, m, BenchParams(n_prompt=cfg.n_prompt, n_gen=cfg.n_gen, repetitions=cfg.repetitions,
                                            runtime=rt), ctx, cfg.perplexity_dataset, cfg.perplexity_chunks,
                     f"kv-{k}-{v}", hw)
        rows.append({"cache_type_k": k, "cache_type_v": v, "kv_estimate": est.model_dump(), "record": rec})
    return {"rows": rows, "validated": True,
            "note": "Speed/memory measured with llama-bench; KV sizes are analytical estimates."}


def run_quant_comparison(s: Services, exp: dict, cfg: QuantComparisonConfig, ctx: JobContext) -> dict:
    _require_llama(s, "quantize", "bench", *(["perplexity"] if cfg.perplexity_dataset else []))
    src = _model_path(s, cfg.model_id)
    analysis = s.models.analysis(src["id"])
    out_dir = Path(cfg.output_dir) if cfg.output_dir else s.settings.artifacts_dir / "quantized"
    out_dir.mkdir(parents=True, exist_ok=True)
    needed = sum(estimate_preset_size(analysis, p)["estimated_bytes"] for p in cfg.presets)
    free = shutil.disk_usage(out_dir).free
    if needed * 1.1 > free:
        raise ResourceLimitError("Not enough disk space for the quantized files",
                                 details={"needed_bytes": needed, "free_bytes": free})
    hw = s.record_hardware_profile()
    rows = []
    for i, preset in enumerate(cfg.presets):
        ctx.check_cancelled()
        ctx.progress(i / len(cfg.presets), f"quantize {preset}")
        dst = out_dir / f"{Path(src['path']).stem}.{preset}.gguf"
        if not dst.exists():
            s.llamacpp.quantize(src["path"], str(dst), preset, imatrix=cfg.imatrix_path, cancel=ctx.cancel)
        try:
            qm = s.models.import_model(str(dst))
        except Exception:
            qm = s.db.find_one("models", path=str(dst.resolve()))
        rec = _bench(s, exp, qm, BenchParams(n_prompt=cfg.n_prompt, n_gen=cfg.n_gen, repetitions=cfg.repetitions,
                                             runtime=RuntimeParams(n_gpu_layers=cfg.n_gpu_layers)),
                     ctx, cfg.perplexity_dataset, cfg.perplexity_chunks, f"quant-{preset}", hw)
        rows.append({"preset": preset, "model_id": qm["id"], "file_size_bytes": qm["file_size_bytes"],
                     "record": rec})
    return {"rows": rows, "validated": bool(cfg.perplexity_dataset),
            "note": None if cfg.perplexity_dataset else "No perplexity dataset: quality not measured."}


TYPES: dict[str, tuple[ExperimentType, type[BaseModel], Runner]] = {
    "quantization_sensitivity": (ExperimentType(
        id="quantization_sensitivity", name="Adaptive bit allocation (weight-space proxy)",
        description="EXP-001. Measures per-tensor sensitivity to quantization with a simulated RTN quantizer "
                    "and compares adaptive allocations with uniform baselines at equal memory budget.",
        cost="moderate", requires=["unquantized GGUF model"],
        config_schema=QuantSensitivityConfig.model_json_schema()), QuantSensitivityConfig, run_quant_sensitivity),
    "kv_cache_comparison": (ExperimentType(
        id="kv_cache_comparison", name="KV cache quantization comparison",
        description="Benchmarks several -ctk/-ctv pairs with llama-bench (+ optional perplexity).",
        cost="expensive", requires=["llama-bench", "GPU recommended"],
        config_schema=KVCacheComparisonConfig.model_json_schema()), KVCacheComparisonConfig, run_kv_comparison),
    "quantization_comparison": (ExperimentType(
        id="quantization_comparison", name="GGUF preset comparison",
        description="Quantizes a source model into several llama.cpp presets, then measures speed, memory "
                    "and (optionally) perplexity for each.",
        cost="expensive", requires=["llama-quantize", "llama-bench", "disk space"],
        config_schema=QuantComparisonConfig.model_json_schema()), QuantComparisonConfig, run_quant_comparison),
}


def validate_config(type_id: str, config: dict) -> BaseModel:
    if type_id not in TYPES:
        raise ValidationFailed(f"Unknown experiment type '{type_id}'", details={"available": list(TYPES)})
    cfg = TYPES[type_id][1].model_validate(config)
    if isinstance(cfg, KVCacheComparisonConfig):
        bad = [t for pair in cfg.pairs for t in pair if t not in KV_CACHE_TYPES]
        if bad:
            raise ValidationFailed(f"Unknown KV cache types {bad}", details={"allowed": KV_CACHE_TYPES})
    if isinstance(cfg, QuantComparisonConfig):
        bad = [p for p in cfg.presets if p not in QUANT_PRESETS]
        if bad:
            raise ValidationFailed(f"Unknown presets {bad}", details={"allowed": QUANT_PRESETS})
    return cfg
