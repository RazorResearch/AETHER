"""Optimization service: memory estimation and profile-driven configuration search.

v0.1 scope (honest): searches *runtime* configurations of an existing model
file (KV cache precision, GPU offload) — weights are never modified. Without
``measure=true`` the result is an estimate (``validated=false``). With
``measure=true`` each feasible candidate is benchmarked with llama-bench;
quality stays a proxy unless a perplexity dataset is supplied.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.benchmarks.records import BenchmarkSpec
from app.benchmarks.runner import run_benchmark
from app.core.errors import ConfirmationRequired, EngineUnavailableError, ValidationFailed
from app.core.optimizer import PROFILES, Candidate, Metric, rank
from app.engines.base import BenchParams, RuntimeParams
from app.optimizations.kv_cache.estimator import compare_kv_strategies
from app.optimizations.memory.planner import plan_memory
from app.optimizations.quantization.planner import estimate_preset_size
from app.optimizations.quantization.types import QUANT_PRESETS, kv_bytes_per_element
from app.services.container import Services
from app.services.jobs import JobContext


class EstimateRequest(BaseModel):
    model_id: str
    n_ctx: int = Field(4096, ge=128, le=1_048_576)
    cache_type_k: str = "f16"
    cache_type_v: str = "f16"
    flash_attn: bool = True
    max_vram_bytes: int | None = None
    max_ram_bytes: int | None = None


class StartRequest(BaseModel):
    model_id: str
    profile: str = "balanced"
    custom_weights: dict[str, float] | None = None
    n_ctx: int = Field(4096, ge=128, le=1_048_576)
    max_vram_bytes: int | None = None
    max_ram_bytes: int | None = None
    kv_pairs: list[tuple[str, str]] = [("f16", "f16"), ("q8_0", "q8_0"), ("q4_0", "q4_0")]
    measure: bool = Field(False, description="Benchmark each feasible candidate with llama-bench.")
    perplexity_dataset: str | None = None
    repetitions: int = Field(3, ge=1, le=20)
    confirm: bool = Field(False, description="Required when measure=true (runs GPU workloads).")


class OptimizationService:
    def __init__(self, s: Services):
        self.s = s

    def profiles(self) -> list[dict]:
        return [p.model_dump() for p in PROFILES.values()]

    def estimate(self, req: EstimateRequest) -> dict:
        analysis = self.s.models.analysis(req.model_id)
        snap = self.s.hardware()
        budget = self.s.memory_budget(snap, req.max_vram_bytes, req.max_ram_bytes)
        try:
            plan = plan_memory(analysis, budget, req.n_ctx, req.cache_type_k, req.cache_type_v, req.flash_attn)
            kv = compare_kv_strategies(analysis.architecture, req.n_ctx)
        except ValueError as exc:
            raise ValidationFailed(str(exc))
        presets = []
        if analysis.format.value == "gguf":
            for p in QUANT_PRESETS:
                try:
                    presets.append(estimate_preset_size(analysis, p))
                except ValueError:
                    pass
        return {
            "model_id": req.model_id,
            "hardware": {"accelerator": snap.accelerator,
                         "vram_free_bytes": budget.vram_available_bytes,
                         "ram_available_bytes": budget.ram_available_bytes},
            "memory_plan": plan.model_dump(),
            "kv_cache": [k.model_dump() for k in kv],
            "quantization_presets": presets,
            "is_estimate": True,
            "warnings": analysis.warnings + plan.warnings,
        }

    def start(self, req: StartRequest) -> dict:
        if req.profile not in PROFILES:
            raise ValidationFailed(f"Unknown profile '{req.profile}'", details={"available": list(PROFILES)})
        if req.profile == "custom" and not req.custom_weights:
            raise ValidationFailed("custom profile requires custom_weights")
        self.s.models.get(req.model_id)
        if req.measure:
            if not req.confirm:
                raise ConfirmationRequired("measure=true runs GPU benchmarks for every candidate; "
                                           "re-send with confirm=true.")
            if not self.s.llamacpp.status().capabilities.get("bench"):
                raise EngineUnavailableError("llama-bench not available: cannot measure candidates.")

        def work(ctx: JobContext) -> dict:
            return self._search(req, ctx)

        job = self.s.jobs.submit("optimization", req.model_dump(mode="json"), work, category="optimization")
        self.s.activity.log("optimization", "optimization.started",
                            f"Optimization search started (profile {req.profile}, measure={req.measure})", "info",
                            {"job_id": job["id"], "model_id": req.model_id})
        return job

    def _search(self, req: StartRequest, ctx: JobContext) -> dict:
        model = self.s.models.get(req.model_id)
        analysis = self.s.models.analysis(req.model_id)
        hw_id, snap = self.s.record_hardware_profile()
        budget = self.s.memory_budget(snap, req.max_vram_bytes, req.max_ram_bytes)
        ctx.progress(0.05, "enumerating candidates")
        candidates: list[Candidate] = []
        notes: list[str] = ["Weights are not modified: candidates are runtime configurations of the same file."]
        for k, v in req.kv_pairs:
            plan = plan_memory(analysis, budget, req.n_ctx, k, v, flash_attn=True)
            if plan.recommended is None:
                notes.append(f"KV {k}/{v}: does not fit ({plan.reason})")
                continue
            p = plan.recommended
            kv_bits = 8 * (kv_bytes_per_element(k) + kv_bytes_per_element(v)) / 2
            candidates.append(Candidate(
                id=f"kv-{k}-{v}-ngl{p.n_gpu_layers}",
                config={"cache_type_k": k, "cache_type_v": v, "n_gpu_layers": p.n_gpu_layers,
                        "flash_attn": True, "n_ctx": req.n_ctx},
                metrics={"memory": Metric(value=p.vram_total_bytes + p.ram_total_bytes, basis="estimated"),
                         "quality": Metric(value=kv_bits, basis="proxy")},
                notes=[f"oom_risk={p.oom_risk}"] + p.assumptions[:1]))
        if req.measure:
            for i, c in enumerate(candidates):
                ctx.check_cancelled()
                ctx.progress(0.1 + 0.85 * i / max(len(candidates), 1), f"benchmark {c.id}")
                rt = RuntimeParams(n_gpu_layers=c.config["n_gpu_layers"], cache_type_k=c.config["cache_type_k"],
                                   cache_type_v=c.config["cache_type_v"], flash_attn=True)
                spec = BenchmarkSpec(model_id=model["id"], params=BenchParams(repetitions=req.repetitions, runtime=rt),
                                     perplexity_dataset=req.perplexity_dataset)
                rec = run_benchmark(spec, model, self.s.llamacpp, snap, hw_id, ctx.cancel)
                sp = rec.speed
                if sp and sp.gen_tokens_per_s:
                    c.metrics["speed"] = Metric(value=sp.gen_tokens_per_s, basis="measured")
                    r = sp.resources
                    if r.energy_joules and r.wall_time_s:
                        toks = (spec.params.n_prompt + spec.params.n_gen) * spec.params.repetitions
                        c.metrics["energy"] = Metric(value=r.energy_joules / toks, basis="measured")
                    peak = (r.peak_vram_bytes or 0) + (r.peak_ram_bytes or 0)
                    if peak:
                        c.metrics["memory"] = Metric(value=peak, basis="measured")
                if "perplexity" in rec.quality:
                    c.metrics["quality"] = Metric(value=-rec.quality["perplexity"].perplexity, basis="measured")
                c.config["benchmark_record"] = rec.model_dump(mode="json")
        else:
            notes.append("measure=false: speed and energy were not measured; ranking uses estimates/proxies.")
        if req.measure and not req.perplexity_dataset:
            notes.append("No perplexity dataset: quality objective is a KV-precision proxy.")
        ctx.progress(0.97, "ranking")
        ranked = rank(candidates, req.profile, req.custom_weights) if candidates else []
        best = ranked[0] if ranked else None
        return {
            "model_id": req.model_id,
            "profile": req.profile,
            "hardware_profile_id": hw_id,
            "outcome": "measured" if req.measure else "estimated_only",
            "optimization_applied": False,
            "validated": bool(best and best.validated),
            "recommended": best.model_dump() if best else None,
            "candidates": [r.model_dump() for r in ranked],
            "notes": notes,
        }
