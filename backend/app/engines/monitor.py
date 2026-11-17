"""Resource monitor for external processes (peak RAM, peak VRAM, GPU energy)."""

from __future__ import annotations

import threading
import time

import psutil

from app.core.hardware import nvml_session
from app.engines.base import ResourceUsage


class ProcessMonitor:
    """Samples a process tree every ``interval`` seconds while it runs.

    * RAM: sum of RSS over the process and its children (exact per-process).
    * VRAM: per-process usage via NVML when the driver exposes it (Linux);
      otherwise device-level ``used - baseline`` (includes other processes,
      labelled ``device_delta``).
    * Energy: NVML cumulative energy counter delta (device-level).
    """

    def __init__(self, pid: int, gpu_index: int = 0, interval: float = 0.05):
        self.pid, self.gpu_index, self.interval = pid, gpu_index, interval
        self.peak_ram = 0
        self.peak_vram: int | None = None
        self.vram_method: str | None = None
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._t0 = 0.0
        self.energy_j: float | None = None
        self.wall = 0.0

    def __enter__(self):
        self._t0 = time.perf_counter()
        self._thread.start()
        return self

    def __exit__(self, *exc):
        self._stop.set()
        self._thread.join(timeout=5)
        self.wall = time.perf_counter() - self._t0

    def _ram(self) -> int:
        try:
            p = psutil.Process(self.pid)
            procs = [p] + p.children(recursive=True)
            return sum(x.memory_info().rss for x in procs if x.is_running())
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return 0

    def _run(self) -> None:
        with nvml_session() as nv:
            h = None
            e0 = base_used = None
            if nv is not None:
                try:
                    h = nv.nvmlDeviceGetHandleByIndex(self.gpu_index)
                    base_used = nv.nvmlDeviceGetMemoryInfo(h).used
                    try:
                        e0 = nv.nvmlDeviceGetTotalEnergyConsumption(h)
                    except Exception:
                        e0 = None
                except Exception:
                    h = None
            while not self._stop.is_set():
                self.peak_ram = max(self.peak_ram, self._ram())
                if h is not None:
                    self._sample_vram(nv, h, base_used)
                self._stop.wait(self.interval)
            if h is not None and e0 is not None:
                try:
                    self.energy_j = (nv.nvmlDeviceGetTotalEnergyConsumption(h) - e0) / 1000.0
                except Exception:
                    pass

    def _sample_vram(self, nv, h, base_used) -> None:
        try:
            pids = {self.pid} | {c.pid for c in psutil.Process(self.pid).children(recursive=True)}
        except Exception:
            pids = {self.pid}
        try:
            procs = nv.nvmlDeviceGetComputeRunningProcesses(h)
            used = [p.usedGpuMemory for p in procs if p.pid in pids and p.usedGpuMemory]
            if used:
                self.vram_method = "nvml_process"
                self.peak_vram = max(self.peak_vram or 0, int(sum(used)))
                return
        except Exception:
            pass
        if base_used is not None and self.vram_method != "nvml_process":
            try:
                delta = nv.nvmlDeviceGetMemoryInfo(h).used - base_used
                self.vram_method = "device_delta"
                self.peak_vram = max(self.peak_vram or 0, int(max(delta, 0)))
            except Exception:
                pass

    def usage(self) -> ResourceUsage:
        return ResourceUsage(
            peak_ram_bytes=self.peak_ram or None,
            peak_vram_bytes=self.peak_vram,
            vram_method=self.vram_method,
            energy_joules=self.energy_j,
            energy_method="nvml_total_energy_delta (device-level)" if self.energy_j is not None else None,
            avg_power_w=(self.energy_j / self.wall) if self.energy_j and self.wall else None,
            wall_time_s=self.wall,
        )
