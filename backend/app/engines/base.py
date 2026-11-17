"""Inference engine abstraction.

An engine exposes *capabilities* and *operations*. Operations an engine
cannot perform raise ``EngineUnavailableError`` / ``FeatureNotImplemented`` —
they never return fabricated results.
"""

from __future__ import annotations

import threading
from abc import ABC, abstractmethod
from typing import Callable

from pydantic import BaseModel, Field

ProgressFn = Callable[[float, str], None]


class CancelToken:
    def __init__(self) -> None:
        self._ev = threading.Event()

    def cancel(self) -> None:
        self._ev.set()

    @property
    def cancelled(self) -> bool:
        return self._ev.is_set()


class EngineStatus(BaseModel):
    name: str
    available: bool
    version: str | None = None
    capabilities: dict[str, bool] = {}
    details: dict = {}
    reason: str | None = Field(None, description="Why the engine is unavailable.")


class RuntimeParams(BaseModel):
    """Runtime configuration of a llama.cpp-style run (no weight changes)."""

    n_gpu_layers: int = 99
    n_threads: int | None = None
    n_batch: int | None = None
    n_ubatch: int | None = None
    cache_type_k: str = "f16"
    cache_type_v: str = "f16"
    flash_attn: bool | None = None
    n_ctx: int | None = None


class BenchParams(BaseModel):
    n_prompt: int = 512
    n_gen: int = 128
    repetitions: int = Field(5, ge=1, le=50)
    runtime: RuntimeParams = RuntimeParams()


class ResourceUsage(BaseModel):
    peak_ram_bytes: int | None = None
    peak_vram_bytes: int | None = None
    vram_method: str | None = None
    energy_joules: float | None = None
    energy_method: str | None = None
    avg_power_w: float | None = None
    wall_time_s: float | None = None


class BenchResult(BaseModel):
    prompt_tokens_per_s: float | None = None
    prompt_tokens_per_s_std: float | None = None
    gen_tokens_per_s: float | None = None
    gen_tokens_per_s_std: float | None = None
    prompt_eval_ms: float | None = None
    ttft_ms: float | None = Field(None, description="Derived: prompt time + one generated token.")
    samples_prompt_ts: list[float] = []
    samples_gen_ts: list[float] = []
    resources: ResourceUsage = ResourceUsage()
    engine_version: str | None = None
    raw: list[dict] | dict | None = None


class PerplexityResult(BaseModel):
    perplexity: float
    uncertainty: float | None = None
    n_ctx: int
    dataset: str
    resources: ResourceUsage = ResourceUsage()


class InferenceEngine(ABC):
    name: str

    @abstractmethod
    def status(self) -> EngineStatus: ...

    @abstractmethod
    def bench(self, model_path: str, params: BenchParams, cancel: CancelToken | None = None,
              progress: ProgressFn | None = None) -> BenchResult: ...

    @abstractmethod
    def perplexity(self, model_path: str, dataset_path: str, runtime: RuntimeParams, n_ctx: int = 512,
                   n_chunks: int | None = None, cancel: CancelToken | None = None) -> PerplexityResult: ...
