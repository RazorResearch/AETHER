"""Timestamped hardware sampling during interactive generation.

Every sample is a real reading (NVML / psutil). Fields that cannot be read are
``None`` — never interpolated or invented.
"""

from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from typing import Callable

import psutil
from pydantic import BaseModel

from app.core.hardware import nvml_session


class HwSample(BaseModel):
    t: float  # seconds since sampler start (monotonic)
    ts: str  # ISO timestamp (UTC)
    gpu_util: float | None = None
    vram_used: int | None = None
    gpu_temp: float | None = None
    gpu_power_w: float | None = None
    energy_mj: int | None = None
    cpu_util: float | None = None
    ram_used: int | None = None
    proc_rss: int | None = None


class HwSummary(BaseModel):
    samples: int
    duration_s: float
    peak_vram_bytes: int | None
    vram_delta_bytes: int | None  # peak - first sample (device-level)
    peak_ram_bytes: int | None
    peak_proc_rss_bytes: int | None
    mean_gpu_util: float | None
    max_gpu_util: float | None
    mean_cpu_util: float | None
    max_gpu_temp: float | None
    mean_power_w: float | None
    gpu_energy_j: float | None
    energy_note: str = "GPU board energy from the NVML counter (GPU only, device-level; excludes CPU/RAM/system)."


class LiveSampler:
    def __init__(self, pid_fn: Callable[[], int | None], interval: float = 0.25, gpu_index: int = 0,
                 on_sample: Callable[[HwSample], None] | None = None, max_samples: int = 4000):
        self.pid_fn, self.interval, self.gpu_index = pid_fn, interval, gpu_index
        self.on_sample = on_sample
        self.max_samples = max_samples
        self.samples: list[HwSample] = []
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._t0 = 0.0

    def start(self) -> "LiveSampler":
        self._t0 = time.perf_counter()
        psutil.cpu_percent(None)  # prime the counter
        self._thread.start()
        return self

    def stop(self) -> HwSummary:
        self._stop.set()
        self._thread.join(timeout=5)
        return self.summary()

    def _run(self) -> None:
        with nvml_session() as nv:
            h = None
            if nv is not None:
                try:
                    h = nv.nvmlDeviceGetHandleByIndex(self.gpu_index)
                except Exception:
                    h = None
            while True:
                s = self._sample(nv, h)
                if len(self.samples) < self.max_samples:
                    self.samples.append(s)
                if self.on_sample:
                    try:
                        self.on_sample(s)
                    except Exception:
                        pass
                if self._stop.wait(self.interval):
                    self.samples.append(self._sample(nv, h))  # closing sample
                    break

    def _sample(self, nv, h) -> HwSample:
        s = HwSample(t=round(time.perf_counter() - self._t0, 4),
                     ts=datetime.now(timezone.utc).isoformat(timespec="milliseconds"))
        if h is not None:
            for attr, fn in (
                ("gpu_util", lambda: float(nv.nvmlDeviceGetUtilizationRates(h).gpu)),
                ("vram_used", lambda: int(nv.nvmlDeviceGetMemoryInfo(h).used)),
                ("gpu_temp", lambda: float(nv.nvmlDeviceGetTemperature(h, nv.NVML_TEMPERATURE_GPU))),
                ("gpu_power_w", lambda: nv.nvmlDeviceGetPowerUsage(h) / 1000.0),
                ("energy_mj", lambda: int(nv.nvmlDeviceGetTotalEnergyConsumption(h))),
            ):
                try:
                    setattr(s, attr, fn())
                except Exception:
                    pass
        s.cpu_util = psutil.cpu_percent(None)
        s.ram_used = int(psutil.virtual_memory().used)
        pid = self.pid_fn()
        if pid:
            try:
                s.proc_rss = int(psutil.Process(pid).memory_info().rss)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        return s

    def summary(self) -> HwSummary:
        xs = self.samples

        def vals(attr):
            return [getattr(x, attr) for x in xs if getattr(x, attr) is not None]

        def mean(v):
            return round(sum(v) / len(v), 3) if v else None

        vram = vals("vram_used")
        energy = vals("energy_mj")
        return HwSummary(
            samples=len(xs),
            duration_s=xs[-1].t if xs else 0.0,
            peak_vram_bytes=max(vram) if vram else None,
            vram_delta_bytes=(max(vram) - vram[0]) if vram else None,
            peak_ram_bytes=max(vals("ram_used"), default=None),
            peak_proc_rss_bytes=max(vals("proc_rss"), default=None),
            mean_gpu_util=mean(vals("gpu_util")),
            max_gpu_util=max(vals("gpu_util"), default=None),
            mean_cpu_util=mean(vals("cpu_util")),
            max_gpu_temp=max(vals("gpu_temp"), default=None),
            mean_power_w=mean(vals("gpu_power_w")),
            gpu_energy_j=round((energy[-1] - energy[0]) / 1000.0, 3) if len(energy) >= 2 else None,
        )
