"""Reproducible benchmark records and comparability checks.

Each record stores everything needed to reproduce or to reject a comparison:
model identity (id + fingerprint + quantization), generation/runtime params,
hardware fingerprint, engine + version, date, repetitions and raw results.
"""

from __future__ import annotations

from datetime import datetime
from statistics import mean, stdev

from pydantic import BaseModel, Field

from app import ENGINE_NAME, __version__
from app.engines.base import BenchParams, BenchResult, PerplexityResult


class BenchmarkSpec(BaseModel):
    model_id: str
    engine: str = "llama.cpp"
    params: BenchParams = BenchParams()
    perplexity_dataset: str | None = Field(
        None, description="Local text file for llama-perplexity. Never downloaded automatically.")
    perplexity_ctx: int = 512
    perplexity_chunks: int | None = Field(None, description="Limit chunks for faster, noisier PPL.")
    experiment_id: str | None = None
    label: str | None = None


class ModelIdentity(BaseModel):
    model_id: str
    name: str
    path: str
    fingerprint: str | None
    format: str
    architecture: str | None
    n_params: int | None
    quantization: str | None
    file_size_bytes: int


class Aggregate(BaseModel):
    mean: float
    std: float | None
    min: float
    max: float
    n: int

    @classmethod
    def of(cls, xs: list[float]) -> "Aggregate | None":
        if not xs:
            return None
        return cls(mean=mean(xs), std=stdev(xs) if len(xs) > 1 else None, min=min(xs), max=max(xs), n=len(xs))


class BenchmarkRecord(BaseModel):
    schema_version: int = 1
    aether_engine: str = f"{ENGINE_NAME} {__version__}"
    created_at: datetime
    model: ModelIdentity
    engine: str
    engine_version: str | None
    hardware_profile_id: str
    hardware_fingerprint: str
    params: BenchParams
    speed: BenchResult | None = None
    prompt_tps: Aggregate | None = None
    gen_tps: Aggregate | None = None
    quality: dict[str, PerplexityResult] = {}
    stability: dict = Field(default_factory=dict, description="coefficient of variation per metric")
    notes: list[str] = []


def stability_metrics(res: BenchResult) -> dict:
    out = {}
    for key, xs in (("prompt_cv", res.samples_prompt_ts), ("gen_cv", res.samples_gen_ts)):
        if len(xs) > 1 and mean(xs) > 0:
            out[key] = stdev(xs) / mean(xs)
    return out


COMPARABILITY_KEYS = [
    ("hardware_fingerprint", "hardware"),
    ("engine", "engine"),
    ("engine_version", "engine version"),
    ("params.n_prompt", "prompt length"),
    ("params.n_gen", "generation length"),
    ("params.runtime.n_threads", "threads"),
    ("params.runtime.n_batch", "batch size"),
    ("params.runtime.n_ubatch", "micro-batch size"),
]


def _dig(d: dict, dotted: str):
    for part in dotted.split("."):
        if not isinstance(d, dict):
            return None
        d = d.get(part)
    return d


def comparability(a: dict, b: dict) -> list[str]:
    """Return human-readable reasons why two records are not directly comparable."""
    issues = []
    for key, label in COMPARABILITY_KEYS:
        va, vb = _dig(a, key), _dig(b, key)
        if va != vb:
            issues.append(f"different {label}: {va!r} vs {vb!r}")
    qa, qb = set(a.get("quality") or {}), set(b.get("quality") or {})
    for k in qa & qb:
        da, db = a["quality"][k], b["quality"][k]
        if da.get("dataset") != db.get("dataset") or da.get("n_ctx") != db.get("n_ctx"):
            issues.append(f"quality metric '{k}' measured on different dataset/context")
    return issues
