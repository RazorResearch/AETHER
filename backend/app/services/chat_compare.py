"""Compare Configurations: controlled, repeated runs of one prompt across configs.

Protocol per configuration:
1. unload any resident model, sample device VRAM (baseline);
2. load the configuration (load time and measured placement recorded);
3. ``warmup_runs`` generations, discarded;
4. ``repetitions`` measured generations with identical prompt, sampling
   parameters and seed; each run is sampled by NVML/psutil.
Reported: median, p25/p75, min/max, std and n per metric. No configuration is
declared "better overall": the best value is given per metric only.
"""

from __future__ import annotations

import statistics
import threading
import time
from datetime import datetime, timezone

from pydantic import BaseModel, Field, model_validator

from app.core.errors import ConfirmationRequired, ConflictError, EngineUnavailableError, ValidationFailed
from app.core.hardware import sample_gpu
from app.database.db import new_id, utcnow
from app.engines.live_sampler import LiveSampler
from app.engines.llama_server import RuntimeConfig, SamplingParams
from app.services.container import Services
from app.services.jobs import JobContext

# metric -> (direction, label, unit)
METRICS: dict[str, tuple[str, str, str]] = {
    "gen_tokens_per_s": ("max", "Generation speed (llama.cpp)", "tok/s"),
    "prompt_tokens_per_s": ("max", "Prompt processing (llama.cpp)", "tok/s"),
    "ttft_ms": ("min", "Time to first token (wall)", "ms"),
    "tpot_ms": ("min", "Time per output token (wall)", "ms"),
    "total_ms": ("min", "Total duration (wall)", "ms"),
    "peak_vram_over_baseline_bytes": ("min", "Peak VRAM over baseline", "bytes"),
    "peak_rss_bytes": ("min", "Peak RAM (llama-server RSS)", "bytes"),
    "mean_gpu_util": ("max", "Mean GPU utilization", "%"),
    "gpu_energy_per_token_j": ("min", "GPU energy per token (GPU only)", "J/tok"),
}


class CompareConfig(BaseModel):
    label: str = Field(min_length=1, max_length=60)
    model_id: str
    runtime: RuntimeConfig = RuntimeConfig()


class CompareRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=50_000)
    system_prompt: str | None = None
    generation: SamplingParams = SamplingParams(temperature=0.0, seed=42, max_tokens=256)
    configs: list[CompareConfig] = Field(min_length=2, max_length=4)
    warmup_runs: int = Field(1, ge=0, le=5)
    repetitions: int = Field(3, ge=1, le=20)
    confirm: bool = False

    @model_validator(mode="after")
    def _seed(self):
        if self.generation.seed is None:
            self.generation.seed = 42
        return self


def _agg(xs: list[float]) -> dict | None:
    xs = [x for x in xs if x is not None]
    if not xs:
        return None
    s = sorted(xs)
    q = statistics.quantiles(s, n=4) if len(s) >= 2 else [s[0], s[0], s[0]]
    return {"median": statistics.median(s), "p25": q[0], "p75": q[2], "min": s[0], "max": s[-1],
            "std": statistics.stdev(s) if len(s) > 1 else None, "n": len(s)}


class CompareService:
    def __init__(self, s: Services):
        self.s = s
        self.runtime = s.chat_runtime

    def list(self, limit: int = 50) -> list[dict]:
        rows, _ = self.s.db.list("chat_comparisons", limit=limit)
        return rows

    def get(self, cid: str) -> dict:
        r = self.s.db.get("chat_comparisons", cid)
        if not r:
            from app.core.errors import NotFoundError
            raise NotFoundError(f"Comparison '{cid}' not found")
        if r.get("job_id"):
            j = self.s.db.get("optimization_jobs", r["job_id"])
            if j:
                r["job"] = {k: j[k] for k in ("id", "status", "progress", "stage", "error")}
        return r

    def start(self, req: CompareRequest) -> dict:
        if not self.runtime.available:
            raise EngineUnavailableError("llama-server is not installed.")
        if not req.confirm:
            n = len(req.configs) * (req.warmup_runs + req.repetitions)
            raise ConfirmationRequired(f"This loads {len(req.configs)} configurations and runs {n} generations on "
                                       "the GPU. Re-send with confirm=true.", details={"generations": n})
        if self.runtime.generating:
            raise ConflictError("A chat generation is running", code="BUSY")
        for c in req.configs:
            m = self.s.models.get(c.model_id)
            if m["format"] != "gguf" or m["status"] != "available":
                raise ValidationFailed(f"Config '{c.label}': model is not a loadable GGUF file")
            c.runtime.validate_types()
            if m.get("context_length") and c.runtime.n_ctx > m["context_length"]:
                raise ValidationFailed(f"Config '{c.label}': context exceeds the model's training context")
        labels = [c.label for c in req.configs]
        if len(set(labels)) != len(labels):
            raise ValidationFailed("Configuration labels must be unique")
        now = utcnow()
        row = self.s.db.insert("chat_comparisons", {"id": new_id("cmp"), "status": "queued",
                                                    "request": req.model_dump(mode="json"),
                                                    "created_at": now, "updated_at": now})

        def work(ctx: JobContext) -> dict:
            self.s.db.update("chat_comparisons", row["id"], {"status": "running", "updated_at": utcnow()})
            return self._run(req, ctx)

        def done(job: dict) -> None:
            self.s.db.update("chat_comparisons", row["id"], {
                "status": job["status"], "results": job.get("result"), "updated_at": utcnow()})

        job = self.s.jobs.submit("chat_compare", {"comparison_id": row["id"]}, work, done, category="benchmark")
        self.s.db.update("chat_comparisons", row["id"], {"job_id": job["id"]})
        self.s.activity.log("benchmark", "chat_compare.started",
                            f"Configuration comparison started ({', '.join(labels)})", "info",
                            {"comparison_id": row["id"], "job_id": job["id"]})
        return self.get(row["id"])

    # ------------------------------------------------------------------ run
    def _one_run(self, messages: list[dict], gen: SamplingParams, cancel: threading.Event) -> dict:
        sampler = LiveSampler(lambda: self.runtime.pid, interval=0.1).start()
        t_req = time.perf_counter()
        t_first = t_last = None
        n = 0
        final: dict = {}
        text: list[str] = []
        try:
            for ev in self.runtime.stream_chat(messages, gen, cancel, cache_prompt=False):
                if ev["type"] in ("token", "reasoning"):
                    t_first = t_first or ev["t"]
                    t_last = ev["t"]
                    n += 1
                    if ev["type"] == "token":
                        text.append(ev["text"])
                elif ev["type"] == "final":
                    final = ev
        finally:
            hw = sampler.stop()
        tim = final.get("timings") or {}
        completion = tim.get("predicted_n") or n
        return {
            "gen_tokens_per_s": tim.get("predicted_per_second"),
            "prompt_tokens_per_s": tim.get("prompt_per_second"),
            "ttft_ms": (t_first - t_req) * 1000 if t_first else None,
            "tpot_ms": (t_last - t_first) / (n - 1) * 1000 if n > 1 and t_last > t_first else None,
            "total_ms": (time.perf_counter() - t_req) * 1000,
            "peak_vram_bytes": hw.peak_vram_bytes,
            "peak_rss_bytes": hw.peak_proc_rss_bytes,
            "mean_gpu_util": hw.mean_gpu_util,
            "gpu_energy_j": hw.gpu_energy_j,
            "gpu_energy_per_token_j": hw.gpu_energy_j / completion if hw.gpu_energy_j and completion else None,
            "completion_tokens": completion,
            "prompt_tokens": (final.get("usage") or {}).get("prompt_tokens"),
            "prompt_tokens_processed": tim.get("prompt_n"),
            "prompt_tokens_cached": tim.get("cache_n"),
            "finish_reason": final.get("finish_reason"),
            "text": "".join(text),
        }

    def _run(self, req: CompareRequest, ctx: JobContext) -> dict:
        messages = ([{"role": "system", "content": req.system_prompt}] if req.system_prompt else []) + \
                   [{"role": "user", "content": req.prompt}]
        cancel = threading.Event()
        total_steps = len(req.configs) * (1 + req.warmup_runs + req.repetitions)
        step = 0
        configs_out = []
        hw = self.s.hardware()
        for c in req.configs:
            model = self.s.models.get(c.model_id)
            ctx.check_cancelled()
            ctx.progress(step / total_steps, f"{c.label}: unloading / baseline")
            self.runtime.unload()
            time.sleep(0.5)
            baseline = sample_gpu().used_bytes
            ctx.progress(step / total_steps, f"{c.label}: loading {model['name']}")
            st = self.runtime.load(model["id"], model["path"], c.runtime)
            time.sleep(0.3)
            loaded_vram = sample_gpu().used_bytes
            step += 1
            for i in range(req.warmup_runs):
                ctx.check_cancelled()
                ctx.progress(step / total_steps, f"{c.label}: warm-up {i + 1}/{req.warmup_runs}")
                self._one_run(messages, req.generation, cancel)
                step += 1
            runs = []
            for i in range(req.repetitions):
                ctx.check_cancelled()
                ctx.progress(step / total_steps, f"{c.label}: run {i + 1}/{req.repetitions}")
                r = self._one_run(messages, req.generation, cancel)
                r["peak_vram_over_baseline_bytes"] = (r["peak_vram_bytes"] - baseline
                                                      if r["peak_vram_bytes"] is not None and baseline is not None
                                                      else None)
                r["run"] = i + 1
                runs.append(r)
                step += 1
            stats = {k: _agg([r.get(k) for r in runs]) for k in METRICS}
            texts = {r["text"] for r in runs}
            configs_out.append({
                "label": c.label,
                "model": {"id": model["id"], "name": model["name"], "quantization": model["quantization"],
                          "fingerprint": model.get("fingerprint")},
                "runtime": c.runtime.model_dump(),
                "load_time_s": st.load_time_s,
                "placement": st.placement.model_dump(),
                "vram_baseline_bytes": baseline,
                "vram_resident_bytes": (loaded_vram - baseline) if loaded_vram is not None and baseline is not None
                else None,
                "runs": [{k: v for k, v in r.items() if k != "text"} for r in runs],
                "stats": stats,
                "output_sample": runs[0]["text"] if runs else "",
                "deterministic_output": len(texts) == 1,
            })
        self.runtime.unload()
        ctx.progress(1.0, "analysis")
        return {
            "measured_at": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "hardware": {"gpu": hw.gpus[0].name if hw.gpus else None, "cpu": hw.cpu.model,
                         "driver": hw.software.nvidia_driver_version},
            "backend": self.s.llamacpp.version(),
            "protocol": {"prompt": req.prompt, "system_prompt": req.system_prompt,
                         "generation": req.generation.model_dump(), "warmup_runs": req.warmup_runs,
                         "repetitions": req.repetitions, "statistic": "median (p25–p75)"},
            "metrics": {k: {"direction": d, "label": l, "unit": u} for k, (d, l, u) in METRICS.items()},
            "configs": configs_out,
            "comparison": self._compare(configs_out),
            "quality": {"evaluated": False,
                        "note": "No quality metric was run. Output samples are stored for manual inspection; "
                                "identical text across runs indicates deterministic decoding."},
            "notes": [
                "Speed figures from llama.cpp timings; TTFT/TPOT measured by AETHER around the HTTP stream.",
                "Prompt caching is disabled for every run (cache_prompt=false): the full prompt is re-processed.",
                "GPU energy is the NVML board counter (GPU only, excludes CPU/RAM/system).",
                "Peak VRAM is device-level minus the baseline measured with no model loaded.",
                "No configuration is ranked overall: compare per metric and weigh quality separately.",
            ],
        }

    @staticmethod
    def _compare(configs: list[dict]) -> dict:
        if not configs:
            return {}
        ref = configs[0]
        out = {}
        for key, (direction, _, _) in METRICS.items():
            vals = {c["label"]: (c["stats"].get(key) or {}).get("median") for c in configs}
            present = {k: v for k, v in vals.items() if v is not None}
            best = None
            if present:
                best = (max if direction == "max" else min)(present, key=present.get)
            base = vals[ref["label"]]
            diffs = {}
            for label, v in vals.items():
                if label == ref["label"] or v is None or base is None:
                    continue
                diffs[label] = {"absolute": v - base, "percent": (v - base) / base * 100 if base else None}
            out[key] = {"medians": vals, "best": best, "reference": ref["label"], "vs_reference": diffs}
        return out
