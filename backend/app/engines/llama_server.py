"""llama-server runtime manager (one resident model at a time).

AETHER reuses llama.cpp's own HTTP server for interactive inference instead of
re-implementing generation. This module:

* starts / stops one ``llama-server`` subprocess bound to 127.0.0.1 on a free port;
* reloads it when the model or a load-time (runtime) parameter changes;
* parses its log for *measured* placement (``offloaded X/Y layers to GPU``,
  per-device model/KV/compute buffer sizes);
* streams ``/v1/chat/completions`` and yields token, reasoning and final
  ``timings`` events (llama.cpp's internal prompt/eval measurements).

A single model is kept resident because the reference GPU has 8 GB of VRAM.
"""

from __future__ import annotations

import json
import re
import socket
import subprocess
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator

import httpx
import psutil
from pydantic import BaseModel, Field

from app.core.errors import ConflictError, EngineUnavailableError, ExecutionError, ValidationFailed
from app.optimizations.quantization.types import KV_CACHE_TYPES

_OFFLOAD_RE = re.compile(r"offloaded (\d+)/(\d+) layers to GPU")
_BUF_RE = re.compile(r"(\S+)\s+(model|KV|compute) buffer size\s*=\s*([\d.]+) MiB")
_DEVICE_RE = re.compile(r"using device (\S+) \(([^)]*)\)")


class RuntimeConfig(BaseModel):
    """Load-time parameters: changing any of them requires reloading the model."""

    n_ctx: int = Field(4096, ge=256, le=1_048_576)
    n_gpu_layers: int = Field(99, ge=0, le=999, description="99 = all layers that exist")
    n_threads: int | None = Field(None, ge=1, le=512)
    n_batch: int = Field(2048, ge=32, le=65536)
    n_ubatch: int = Field(512, ge=32, le=65536)
    flash_attn: str = Field("auto", pattern="^(on|off|auto)$")
    cache_type_k: str = "f16"
    cache_type_v: str = "f16"

    def validate_types(self) -> None:
        for t in (self.cache_type_k, self.cache_type_v):
            if t not in KV_CACHE_TYPES:
                raise ValidationFailed(f"Unsupported KV cache type '{t}'", details={"allowed": KV_CACHE_TYPES})
        if self.cache_type_v not in ("f16", "f32", "bf16") and self.flash_attn == "off":
            raise ValidationFailed("A quantized V cache requires flash attention (set flash_attn to 'on' or 'auto').")
        if self.n_ubatch > self.n_batch:
            raise ValidationFailed("n_ubatch must be <= n_batch")


class SamplingParams(BaseModel):
    """Per-request generation parameters (no reload needed)."""

    temperature: float = Field(0.7, ge=0.0, le=5.0)
    top_p: float = Field(0.95, ge=0.0, le=1.0)
    top_k: int = Field(40, ge=0, le=1000)
    min_p: float = Field(0.05, ge=0.0, le=1.0)
    repeat_penalty: float = Field(1.1, ge=0.5, le=2.5)
    max_tokens: int = Field(1024, ge=1, le=131072)
    seed: int | None = Field(None, ge=0, le=2**32 - 1)


class Placement(BaseModel):
    """Measured from llama-server's load log (not estimated)."""

    layers_on_gpu: int | None = None
    layers_total: int | None = None
    device: str | None = None
    buffers_mib: dict[str, dict[str, float]] = {}  # device -> {model, KV, compute}


class RuntimeStatus(BaseModel):
    state: str  # unloaded | loading | ready | unloading | error
    model_id: str | None = None
    model_path: str | None = None
    config: RuntimeConfig | None = None
    pid: int | None = None
    port: int | None = None
    since: float | None = None
    load_time_s: float | None = None
    placement: Placement = Placement()
    build_info: str | None = None
    error: str | None = None
    log_tail: list[str] = []


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@dataclass
class _Proc:
    popen: subprocess.Popen
    port: int
    log: deque = field(default_factory=lambda: deque(maxlen=400))
    reader: threading.Thread | None = None


class LlamaServerRuntime:
    def __init__(self, argv_prefix: list[str] | None, load_timeout_s: int = 300):
        self.argv_prefix = argv_prefix
        self.load_timeout_s = load_timeout_s
        self._lock = threading.RLock()
        self._proc: _Proc | None = None
        self._status = RuntimeStatus(state="unloaded")
        self._busy = threading.Lock()  # one generation at a time (single slot)

    # ----------------------------------------------------------------- status
    @property
    def available(self) -> bool:
        return bool(self.argv_prefix)

    def status(self) -> RuntimeStatus:
        with self._lock:
            st = self._status.model_copy(deep=True)
            if self._proc:
                st.log_tail = list(self._proc.log)[-15:]
                if self._proc.popen.poll() is not None and st.state in ("ready", "loading"):
                    st.state = "error"
                    st.error = f"llama-server exited with code {self._proc.popen.returncode}"
            return st

    @property
    def pid(self) -> int | None:
        return self._proc.popen.pid if self._proc else None

    @property
    def base_url(self) -> str:
        if not self._proc:
            raise ExecutionError("No model is loaded", code="MODEL_NOT_LOADED")
        return f"http://127.0.0.1:{self._proc.port}"

    def is_loaded(self, model_id: str, cfg: RuntimeConfig) -> bool:
        st = self.status()
        return st.state == "ready" and st.model_id == model_id and st.config == cfg

    # ------------------------------------------------------------ lifecycle
    def ensure_loaded(self, model_id: str, model_path: str, cfg: RuntimeConfig) -> RuntimeStatus:
        if self.is_loaded(model_id, cfg):
            return self.status()
        return self.load(model_id, model_path, cfg)

    def load(self, model_id: str, model_path: str, cfg: RuntimeConfig) -> RuntimeStatus:
        if not self.available:
            raise EngineUnavailableError("llama-server not found. Install llama.cpp and set AETHER_LLAMACPP_DIR.")
        cfg.validate_types()
        if not Path(model_path).is_file():
            raise ValidationFailed(f"Model file not found: {model_path}")
        if self._busy.locked():
            raise ConflictError("A generation is running; stop it before switching model/configuration",
                                code="BUSY")
        with self._lock:
            self._stop_locked("unloading")
            port = _free_port()
            argv = list(self.argv_prefix) + [
                "-m", model_path, "--host", "127.0.0.1", "--port", str(port),
                "-c", str(cfg.n_ctx), "-ngl", str(cfg.n_gpu_layers), "-b", str(cfg.n_batch),
                "-ub", str(cfg.n_ubatch), "-fa", cfg.flash_attn, "-ctk", cfg.cache_type_k,
                "-ctv", cfg.cache_type_v, "-np", "1", "--no-ui", "--metrics", "-lv", "4",
            ]
            if cfg.n_threads:
                argv += ["-t", str(cfg.n_threads)]
            try:
                popen = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                                         encoding="utf-8", errors="replace")
            except OSError as exc:
                raise EngineUnavailableError(f"Cannot start llama-server: {exc}")
            proc = _Proc(popen, port)
            proc.reader = threading.Thread(target=self._read_log, args=(proc,), daemon=True)
            proc.reader.start()
            self._proc = proc
            t0 = time.time()
            self._status = RuntimeStatus(state="loading", model_id=model_id, model_path=model_path, config=cfg,
                                         pid=popen.pid, port=port, since=t0)
        # wait outside the lock so status() stays responsive
        deadline = time.monotonic() + self.load_timeout_s
        while time.monotonic() < deadline:
            if popen.poll() is not None:
                tail = "\n".join(list(proc.log)[-20:])
                with self._lock:
                    self._status.state = "error"
                    self._status.error = f"llama-server exited during load (code {popen.returncode})"
                raise ExecutionError("Model failed to load", code="MODEL_LOAD_FAILED",
                                     details={"log_tail": tail})
            try:
                r = httpx.get(f"http://127.0.0.1:{port}/health", timeout=1.0)
                if r.status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            time.sleep(0.2)
        else:
            self.unload()
            raise ExecutionError(f"Model did not become ready within {self.load_timeout_s}s", code="TIMEOUT")
        build = None
        try:
            build = httpx.get(f"http://127.0.0.1:{port}/props", timeout=2.0).json().get("build_info")
        except Exception:
            pass
        with self._lock:
            self._status.state = "ready"
            self._status.load_time_s = round(time.time() - t0, 3)
            self._status.build_info = build
            self._status.placement = self._parse_placement(list(proc.log))
        return self.status()

    def unload(self) -> RuntimeStatus:
        if self._busy.locked():
            raise ConflictError("A generation is running; stop it first", code="BUSY")
        with self._lock:
            self._stop_locked("unloading")
            self._status = RuntimeStatus(state="unloaded")
        return self.status()

    def _stop_locked(self, state: str) -> None:
        if not self._proc:
            return
        self._status.state = state
        p = self._proc.popen
        if p.poll() is None:
            p.terminate()
            try:
                p.wait(timeout=10)
            except subprocess.TimeoutExpired:
                p.kill()
                p.wait(timeout=5)
        self._proc = None

    def shutdown(self) -> None:
        with self._lock:
            self._stop_locked("unloading")
            self._status = RuntimeStatus(state="unloaded")

    @staticmethod
    def _read_log(proc: _Proc) -> None:
        assert proc.popen.stdout is not None
        for line in proc.popen.stdout:
            proc.log.append(line.rstrip())

    @staticmethod
    def _parse_placement(lines: list[str]) -> Placement:
        pl = Placement()
        for line in lines:
            m = _OFFLOAD_RE.search(line)
            if m:
                pl.layers_on_gpu, pl.layers_total = int(m.group(1)), int(m.group(2))
            m = _DEVICE_RE.search(line)
            if m:
                pl.device = f"{m.group(1)} ({m.group(2)})"
            m = _BUF_RE.search(line)
            if m:
                dev, kind, mib = m.group(1), m.group(2), float(m.group(3))
                d = pl.buffers_mib.setdefault(dev, {})
                d[kind] = round(d.get(kind, 0.0) + mib, 2)
        return pl

    # ------------------------------------------------------------ generation
    def stream_chat(self, messages: list[dict], sampling: SamplingParams,
                    cancel: threading.Event) -> Iterator[dict]:
        """Yield events: {'type': 'token'|'reasoning', 'text', 't'} then {'type': 'final', ...}.

        Cancellation closes the HTTP stream; llama-server aborts the task when
        the client disconnects, so generation really stops on the backend.
        """
        if not self._busy.acquire(blocking=False):
            raise ConflictError("Another generation is already running", code="BUSY")
        try:
            body = {
                "messages": messages, "stream": True, "stream_options": {"include_usage": True},
                "temperature": sampling.temperature, "top_p": sampling.top_p, "top_k": sampling.top_k,
                "min_p": sampling.min_p, "repeat_penalty": sampling.repeat_penalty,
                "max_tokens": sampling.max_tokens, "timings_per_token": False,
            }
            if sampling.seed is not None:
                body["seed"] = sampling.seed
            final: dict = {"type": "final", "finish_reason": None, "timings": None, "usage": None}
            with httpx.Client(timeout=httpx.Timeout(10.0, read=600.0)) as client:
                with client.stream("POST", f"{self.base_url}/v1/chat/completions", json=body) as r:
                    if r.status_code != 200:
                        r.read()
                        raise ExecutionError(f"llama-server answered HTTP {r.status_code}",
                                             details={"body": r.text[:2000]})
                    for line in r.iter_lines():
                        if cancel.is_set():
                            final["finish_reason"] = "stopped"
                            break
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        chunk = json.loads(data)
                        now = time.perf_counter()
                        if "error" in chunk:
                            raise ExecutionError(str(chunk["error"]))
                        for ch in chunk.get("choices") or []:
                            delta = ch.get("delta") or {}
                            if delta.get("reasoning_content"):
                                yield {"type": "reasoning", "text": delta["reasoning_content"], "t": now}
                            if delta.get("content"):
                                yield {"type": "token", "text": delta["content"], "t": now}
                            if ch.get("finish_reason"):
                                final["finish_reason"] = ch["finish_reason"]
                        if chunk.get("timings"):
                            final["timings"] = chunk["timings"]
                        if chunk.get("usage"):
                            final["usage"] = chunk["usage"]
            yield final
        except httpx.HTTPError as exc:
            raise ExecutionError(f"Connection to llama-server failed: {exc}", code="RUNTIME_CONNECTION")
        finally:
            self._busy.release()

    @property
    def generating(self) -> bool:
        return self._busy.locked()

    def process_rss(self) -> int | None:
        pid = self.pid
        if not pid:
            return None
        try:
            return psutil.Process(pid).memory_info().rss
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return None
