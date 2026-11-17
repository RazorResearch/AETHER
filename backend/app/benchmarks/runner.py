"""Benchmark runner: executes a ``BenchmarkSpec`` and produces a ``BenchmarkRecord``."""

from __future__ import annotations

from datetime import datetime, timezone

from app.benchmarks.records import (Aggregate, BenchmarkRecord, BenchmarkSpec, ModelIdentity,
                                    stability_metrics)
from app.core.hardware import HardwareSnapshot, hardware_fingerprint
from app.engines.base import CancelToken, InferenceEngine, ProgressFn


def run_benchmark(spec: BenchmarkSpec, model: dict, engine: InferenceEngine, hw: HardwareSnapshot,
                  hardware_profile_id: str, cancel: CancelToken | None = None,
                  progress: ProgressFn | None = None) -> BenchmarkRecord:
    progress = progress or (lambda *_: None)
    notes: list[str] = []
    if hw.accelerator == "cpu" and spec.params.runtime.n_gpu_layers > 0:
        notes.append("no CUDA GPU detected: n_gpu_layers has no effect (CPU run)")
    progress(0.05, "speed benchmark")
    speed = engine.bench(model["path"], spec.params, cancel=cancel,
                         progress=lambda f, m: progress(0.05 + 0.6 * f, m))
    quality = {}
    if spec.perplexity_dataset:
        progress(0.7, "perplexity")
        quality["perplexity"] = engine.perplexity(model["path"], spec.perplexity_dataset, spec.params.runtime,
                                                  n_ctx=spec.perplexity_ctx, n_chunks=spec.perplexity_chunks,
                                                  cancel=cancel)
    else:
        notes.append("no quality metric measured (no perplexity dataset provided)")
    if speed.resources.vram_method == "device_delta":
        notes.append("peak VRAM is a device-level delta (may include other processes)")
    progress(1.0, "done")
    return BenchmarkRecord(
        created_at=datetime.now(timezone.utc),
        model=ModelIdentity(model_id=model["id"], name=model["name"], path=model["path"],
                            fingerprint=model.get("fingerprint"), format=model["format"],
                            architecture=model.get("architecture"), n_params=model.get("n_params"),
                            quantization=model.get("quantization"), file_size_bytes=model["file_size_bytes"]),
        engine=engine.name,
        engine_version=speed.engine_version,
        hardware_profile_id=hardware_profile_id,
        hardware_fingerprint=hardware_fingerprint(hw),
        params=spec.params,
        speed=speed,
        prompt_tps=Aggregate.of(speed.samples_prompt_ts),
        gen_tps=Aggregate.of(speed.samples_gen_ts),
        quality=quality,
        stability=stability_metrics(speed),
        notes=notes,
    )
