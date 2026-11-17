"""llama.cpp adapter (subprocess-based).

Wraps the official llama.cpp tools instead of re-implementing them:
``llama-bench`` (speed), ``llama-perplexity`` (quality), ``llama-quantize``
and ``llama-imatrix`` (quantization). Binaries are located in
``AETHER_LLAMACPP_DIR`` then on ``PATH``. Nothing is downloaded.

Tests inject fake binaries through ``LlamaCppEngine(binaries=...)`` where each
entry is an argv prefix (e.g. ``[sys.executable, "fake_bench.py"]``).
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

from app.core.errors import EngineUnavailableError, ExecutionError
from app.engines.base import (BenchParams, BenchResult, CancelToken, EngineStatus, InferenceEngine,
                              PerplexityResult, ProgressFn, RuntimeParams)
from app.engines.monitor import ProcessMonitor

TOOLS = ("llama-bench", "llama-perplexity", "llama-quantize", "llama-imatrix", "llama-cli", "llama-server")
_PPL_RE = re.compile(r"Final estimate:\s*PPL\s*=\s*([0-9.]+)\s*\+/-\s*([0-9.]+)")
_VERSION_RE = re.compile(r"version:\s*(\d+)\s*\(([0-9a-f]+)\)")
_VERSION_RE2 = re.compile(r"build\s+(\d+),\s*commit\s+([0-9a-f]+)")


def find_binaries(search_dir: Path | None) -> dict[str, list[str]]:
    exe = ".exe" if os.name == "nt" else ""
    found: dict[str, list[str]] = {}
    for tool in TOOLS:
        cands = []
        if search_dir:
            cands += [search_dir / f"{tool}{exe}", search_dir / "bin" / f"{tool}{exe}",
                      search_dir / "build" / "bin" / f"{tool}{exe}",
                      search_dir / "build" / "bin" / "Release" / f"{tool}{exe}"]
        path = next((str(c) for c in cands if c.is_file()), None) or shutil.which(tool)
        if path:
            found[tool] = [path]
    return found


class LlamaCppEngine(InferenceEngine):
    name = "llama.cpp"

    def __init__(self, search_dir: Path | None = None, binaries: dict[str, list[str]] | None = None,
                 timeout_s: int = 3600, gpu_index: int = 0):
        self.binaries = binaries if binaries is not None else find_binaries(search_dir)
        self.timeout_s = timeout_s
        self.gpu_index = gpu_index
        self._version: str | None = None

    # ------------------------------------------------------------------ helpers
    def _argv(self, tool: str) -> list[str]:
        if tool not in self.binaries:
            raise EngineUnavailableError(
                f"llama.cpp tool '{tool}' not found. Build llama.cpp and set AETHER_LLAMACPP_DIR.",
                details={"tool": tool, "found": sorted(self.binaries)})
        return list(self.binaries[tool])

    def version(self) -> str | None:
        if self._version is None and "llama-bench" in self.binaries:
            try:
                out = subprocess.run(self._argv("llama-bench") + ["--version"], capture_output=True,
                                     text=True, timeout=30)
                text = out.stdout + out.stderr
                m = _VERSION_RE.search(text) or _VERSION_RE2.search(text)
                self._version = f"b{m.group(1)} ({m.group(2)})" if m else (text.strip().splitlines() or [None])[0]
            except Exception:
                self._version = None
        return self._version

    def status(self) -> EngineStatus:
        caps = {"bench": "llama-bench" in self.binaries, "perplexity": "llama-perplexity" in self.binaries,
                "quantize": "llama-quantize" in self.binaries, "imatrix": "llama-imatrix" in self.binaries}
        avail = any(caps.values())
        return EngineStatus(name=self.name, available=avail, version=self.version() if avail else None,
                            capabilities=caps, details={"binaries": {k: v[-1] for k, v in self.binaries.items()}},
                            reason=None if avail else "No llama.cpp binaries found (set AETHER_LLAMACPP_DIR).")

    def run(self, argv: list[str], cancel: CancelToken | None = None,
            timeout_s: int | None = None) -> tuple[str, str, ProcessMonitor]:
        timeout_s = timeout_s or self.timeout_s
        try:
            proc = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                    encoding="utf-8", errors="replace")
        except OSError as exc:
            raise EngineUnavailableError(f"Cannot execute {argv[0]}: {exc}")
        stdout_parts: list[str] = []
        stderr_parts: list[str] = []

        def pump(stream, sink):
            for line in stream:
                sink.append(line)

        ts = [threading.Thread(target=pump, args=(proc.stdout, stdout_parts), daemon=True),
              threading.Thread(target=pump, args=(proc.stderr, stderr_parts), daemon=True)]
        for t in ts:
            t.start()
        t0 = time.monotonic()
        with ProcessMonitor(proc.pid, self.gpu_index) as mon:
            while proc.poll() is None:
                if cancel and cancel.cancelled:
                    proc.kill()
                    proc.wait()
                    raise ExecutionError("Cancelled by user", code="CANCELLED")
                if time.monotonic() - t0 > timeout_s:
                    proc.kill()
                    proc.wait()
                    raise ExecutionError(f"{Path(argv[0]).name} timed out after {timeout_s}s", code="TIMEOUT")
                time.sleep(0.05)
        for t in ts:
            t.join(timeout=5)
        out, err = "".join(stdout_parts), "".join(stderr_parts)
        if proc.returncode != 0:
            raise ExecutionError(f"{Path(argv[0]).name} exited with code {proc.returncode}",
                                 details={"stderr_tail": err[-4000:], "argv": argv})
        return out, err, mon

    @staticmethod
    def runtime_args(rt: RuntimeParams, bench: bool = False) -> list[str]:
        a = ["-ngl", str(rt.n_gpu_layers), "-ctk", rt.cache_type_k, "-ctv", rt.cache_type_v]
        if rt.n_threads:
            a += ["-t", str(rt.n_threads)]
        if rt.n_batch:
            a += ["-b", str(rt.n_batch)]
        if rt.n_ubatch:
            a += ["-ub", str(rt.n_ubatch)]
        if rt.flash_attn is not None:
            a += ["-fa", ("1" if rt.flash_attn else "0") if bench else ("on" if rt.flash_attn else "off")]
        if rt.n_ctx and not bench:
            a += ["-c", str(rt.n_ctx)]
        return a

    # ------------------------------------------------------------------ operations
    def bench(self, model_path: str, params: BenchParams, cancel: CancelToken | None = None,
              progress: ProgressFn | None = None) -> BenchResult:
        argv = self._argv("llama-bench") + ["-m", model_path, "-p", str(params.n_prompt), "-n", str(params.n_gen),
                                            "-r", str(params.repetitions), "-o", "json"]
        argv += self.runtime_args(params.runtime, bench=True)
        if progress:
            progress(0.05, "running llama-bench")
        out, _, mon = self.run(argv, cancel)
        res = parse_llama_bench_json(out)
        res.resources = mon.usage()
        res.engine_version = res.engine_version or self.version()
        if progress:
            progress(1.0, "done")
        return res

    def perplexity(self, model_path: str, dataset_path: str, runtime: RuntimeParams, n_ctx: int = 512,
                   n_chunks: int | None = None, cancel: CancelToken | None = None) -> PerplexityResult:
        if not Path(dataset_path).is_file():
            raise ExecutionError(f"Perplexity dataset not found: {dataset_path}", code="FILE_NOT_FOUND")
        argv = self._argv("llama-perplexity") + ["-m", model_path, "-f", dataset_path, "-c", str(n_ctx)]
        argv += self.runtime_args(runtime.model_copy(update={"n_ctx": None}))
        if n_chunks:
            argv += ["--chunks", str(n_chunks)]
        out, err, mon = self.run(argv, cancel)
        m = _PPL_RE.search(out + err)
        if not m:
            raise ExecutionError("Could not parse perplexity output", details={"tail": (out + err)[-2000:]})
        return PerplexityResult(perplexity=float(m.group(1)), uncertainty=float(m.group(2)), n_ctx=n_ctx,
                                dataset=str(dataset_path), resources=mon.usage())

    def quantize(self, src: str, dst: str, preset: str, imatrix: str | None = None,
                 tensor_types: dict[str, str] | None = None, threads: int | None = None,
                 cancel: CancelToken | None = None) -> dict:
        argv = self._argv("llama-quantize")
        if imatrix:
            argv += ["--imatrix", imatrix]
        for pattern, ttype in (tensor_types or {}).items():
            # requires a llama.cpp build with --tensor-type support (2025+)
            argv += ["--tensor-type", f"{pattern}={ttype.lower()}"]
        argv += [src, dst, preset]
        if threads:
            argv.append(str(threads))
        out, err, mon = self.run(argv, cancel)
        if not Path(dst).is_file():
            raise ExecutionError("llama-quantize finished but produced no output file", details={"dst": dst})
        return {"output": dst, "size_bytes": Path(dst).stat().st_size, "log_tail": (out + err)[-2000:],
                "resources": mon.usage().model_dump()}

    def imatrix(self, model_path: str, calibration_path: str, out_path: str, runtime: RuntimeParams,
                n_chunks: int | None = None, cancel: CancelToken | None = None) -> dict:
        argv = self._argv("llama-imatrix") + ["-m", model_path, "-f", calibration_path, "-o", out_path]
        argv += self.runtime_args(runtime)
        if n_chunks:
            argv += ["--chunks", str(n_chunks)]
        _, _, mon = self.run(argv, cancel)
        return {"output": out_path, "resources": mon.usage().model_dump()}


def parse_llama_bench_json(text: str) -> BenchResult:
    """Parse ``llama-bench -o json``: a list of test records (pp or tg rows)."""
    start = text.find("[")
    if start < 0:
        raise ExecutionError("llama-bench produced no JSON output", details={"tail": text[-2000:]})
    try:
        rows = json.loads(text[start:text.rfind("]") + 1])
    except json.JSONDecodeError as exc:
        raise ExecutionError(f"Invalid llama-bench JSON: {exc}", details={"tail": text[-2000:]})
    res = BenchResult(raw=rows)
    for r in rows:
        n_p, n_g = int(r.get("n_prompt", 0)), int(r.get("n_gen", 0))
        samples = [float(x) for x in r.get("samples_ts", [])]
        if n_p > 0 and n_g == 0:
            res.prompt_tokens_per_s = float(r["avg_ts"])
            res.prompt_tokens_per_s_std = float(r.get("stddev_ts", 0))
            res.samples_prompt_ts = samples
            res.prompt_eval_ms = n_p / res.prompt_tokens_per_s * 1000 if res.prompt_tokens_per_s else None
        elif n_g > 0 and n_p == 0:
            res.gen_tokens_per_s = float(r["avg_ts"])
            res.gen_tokens_per_s_std = float(r.get("stddev_ts", 0))
            res.samples_gen_ts = samples
        if r.get("build_commit"):
            res.engine_version = f"b{r.get('build_number', '?')} ({r['build_commit']})"
    if res.prompt_eval_ms is not None and res.gen_tokens_per_s:
        res.ttft_ms = res.prompt_eval_ms + 1000.0 / res.gen_tokens_per_s
    if res.prompt_tokens_per_s is None and res.gen_tokens_per_s is None:
        raise ExecutionError("llama-bench output contained no pp/tg rows", details={"rows": rows})
    return res


if __name__ == "__main__":  # pragma: no cover
    print(LlamaCppEngine(Path(sys.argv[1]) if len(sys.argv) > 1 else None).status().model_dump_json(indent=2))
