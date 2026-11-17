"""Hardware Analyzer.

Detects GPU (NVIDIA via NVML), CPU, RAM, disk, CUDA and driver versions.

Rules:
* Never invent a value. Anything that cannot be read is ``None`` and the reason
  is appended to ``warnings``.
* Works without an NVIDIA GPU, without CUDA and without PyTorch.
* Every NVML handle is released (``nvmlShutdown``) after each snapshot.
"""

from __future__ import annotations

import os
import platform
import sys
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

import psutil
from pydantic import BaseModel, Field


class GPUInfo(BaseModel):
    index: int
    vendor: str = "NVIDIA"
    name: str | None = None
    uuid: str | None = None
    vram_total_bytes: int | None = None
    vram_free_bytes: int | None = None
    vram_used_bytes: int | None = None
    utilization_gpu_percent: float | None = None
    utilization_memory_percent: float | None = None
    temperature_c: float | None = None
    power_draw_w: float | None = None
    power_limit_w: float | None = None
    compute_capability: str | None = None
    energy_counter_supported: bool = False


class CPUInfo(BaseModel):
    model: str | None = None
    architecture: str | None = None
    physical_cores: int | None = None
    logical_cores: int | None = None
    frequency_mhz: float | None = None
    utilization_percent: float | None = None


class MemoryInfo(BaseModel):
    total_bytes: int
    available_bytes: int
    used_bytes: int
    percent: float
    swap_total_bytes: int
    swap_used_bytes: int


class DiskInfo(BaseModel):
    path: str
    total_bytes: int
    free_bytes: int
    used_bytes: int


class SoftwareInfo(BaseModel):
    os: str
    os_release: str
    python: str
    nvidia_driver_version: str | None = None
    cuda_driver_version: str | None = Field(
        None, description="Highest CUDA version supported by the installed driver (NVML)."
    )
    cuda_runtime_version: str | None = Field(
        None, description="CUDA runtime bundled with PyTorch, if PyTorch is installed."
    )
    nvml_version: str | None = None
    torch_version: str | None = None
    torch_cuda_available: bool | None = None


class HardwareSnapshot(BaseModel):
    captured_at: datetime
    gpus: list[GPUInfo]
    cpu: CPUInfo
    memory: MemoryInfo
    disks: list[DiskInfo]
    software: SoftwareInfo
    cuda_available: bool
    accelerator: str = Field(description="'cuda' if a usable NVIDIA GPU was detected, else 'cpu'.")
    warnings: list[str] = []


def _decode(v) -> str:
    return v.decode() if isinstance(v, bytes) else str(v)


@contextmanager
def nvml_session(warnings: list[str] | None = None) -> Iterator[object | None]:
    """Yield the ``pynvml`` module if NVML could be initialised, else ``None``."""
    try:
        import pynvml  # provided by nvidia-ml-py
    except Exception as exc:  # pragma: no cover - depends on environment
        if warnings is not None:
            warnings.append(f"nvidia-ml-py not importable: {exc}")
        yield None
        return
    try:
        pynvml.nvmlInit()
    except Exception as exc:
        if warnings is not None:
            warnings.append(f"NVML unavailable (no NVIDIA driver/GPU?): {exc}")
        yield None
        return
    try:
        yield pynvml
    finally:
        try:
            pynvml.nvmlShutdown()
        except Exception:
            pass


def _try(fn, warnings: list[str], label: str):
    try:
        return fn()
    except Exception as exc:
        warnings.append(f"{label}: {type(exc).__name__}: {exc}")
        return None


def _read_gpus(nv, warnings: list[str]) -> list[GPUInfo]:
    gpus: list[GPUInfo] = []
    count = _try(nv.nvmlDeviceGetCount, warnings, "nvmlDeviceGetCount") or 0
    for i in range(count):
        h = _try(lambda: nv.nvmlDeviceGetHandleByIndex(i), warnings, f"gpu{i} handle")
        if h is None:
            continue
        info = GPUInfo(index=i)
        info.name = _try(lambda: _decode(nv.nvmlDeviceGetName(h)), warnings, f"gpu{i} name")
        info.uuid = _try(lambda: _decode(nv.nvmlDeviceGetUUID(h)), warnings, f"gpu{i} uuid")
        mem = _try(lambda: nv.nvmlDeviceGetMemoryInfo(h), warnings, f"gpu{i} memory")
        if mem is not None:
            info.vram_total_bytes, info.vram_free_bytes, info.vram_used_bytes = (
                int(mem.total), int(mem.free), int(mem.used))
        util = _try(lambda: nv.nvmlDeviceGetUtilizationRates(h), warnings, f"gpu{i} utilization")
        if util is not None:
            info.utilization_gpu_percent = float(util.gpu)
            info.utilization_memory_percent = float(util.memory)
        temp = _try(lambda: nv.nvmlDeviceGetTemperature(h, nv.NVML_TEMPERATURE_GPU),
                    warnings, f"gpu{i} temperature")
        info.temperature_c = float(temp) if temp is not None else None
        p = _try(lambda: nv.nvmlDeviceGetPowerUsage(h), warnings, f"gpu{i} power")
        info.power_draw_w = p / 1000.0 if p is not None else None
        pl = _try(lambda: nv.nvmlDeviceGetEnforcedPowerLimit(h), warnings, f"gpu{i} power limit")
        info.power_limit_w = pl / 1000.0 if pl is not None else None
        cc = _try(lambda: nv.nvmlDeviceGetCudaComputeCapability(h), warnings, f"gpu{i} compute capability")
        info.compute_capability = f"{cc[0]}.{cc[1]}" if cc else None
        try:
            nv.nvmlDeviceGetTotalEnergyConsumption(h)
            info.energy_counter_supported = True
        except Exception:
            info.energy_counter_supported = False
        gpus.append(info)
    return gpus


def _cpu_model() -> str | None:
    system = platform.system()
    try:
        if system == "Linux":
            for line in Path("/proc/cpuinfo").read_text(errors="ignore").splitlines():
                if line.lower().startswith("model name"):
                    return line.split(":", 1)[1].strip()
        elif system == "Windows":
            import winreg

            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                                 r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
            return str(winreg.QueryValueEx(key, "ProcessorNameString")[0]).strip()
        elif system == "Darwin":
            import subprocess

            out = subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"],
                                 capture_output=True, text=True, timeout=5)
            return out.stdout.strip() or None
    except Exception:
        return None
    return platform.processor() or None


def _torch_info(sw: SoftwareInfo, warnings: list[str]) -> None:
    """Only inspects torch if it is *already installed*; never imports CUDA eagerly otherwise."""
    import importlib.util

    if importlib.util.find_spec("torch") is None:
        return
    try:
        import torch

        sw.torch_version = torch.__version__
        sw.cuda_runtime_version = torch.version.cuda
        sw.torch_cuda_available = bool(torch.cuda.is_available())
    except Exception as exc:
        warnings.append(f"PyTorch present but failed to load: {exc}")


def disk_info(paths: list[Path]) -> list[DiskInfo]:
    seen: set[str] = set()
    out: list[DiskInfo] = []
    for p in paths:
        p = Path(p)
        probe = p if p.exists() else next((a for a in p.parents if a.exists()), None)
        if probe is None:
            continue
        try:
            u = psutil.disk_usage(str(probe))
        except Exception:
            continue
        key = f"{u.total}:{u.free}:{probe.anchor}"
        if key in seen:
            continue
        seen.add(key)
        out.append(DiskInfo(path=str(probe), total_bytes=u.total, free_bytes=u.free, used_bytes=u.used))
    return out


def collect_hardware(disk_paths: list[Path] | None = None, include_torch: bool = True,
                     cpu_sample_s: float = 0.1) -> HardwareSnapshot:
    warnings: list[str] = []
    sw = SoftwareInfo(os=platform.system(), os_release=platform.release(),
                      python=sys.version.split()[0])
    gpus: list[GPUInfo] = []
    with nvml_session(warnings) as nv:
        if nv is not None:
            sw.nvml_version = _try(lambda: _decode(nv.nvmlSystemGetNVMLVersion()), warnings, "NVML version")
            sw.nvidia_driver_version = _try(lambda: _decode(nv.nvmlSystemGetDriverVersion()),
                                            warnings, "driver version")
            cuda_v = _try(nv.nvmlSystemGetCudaDriverVersion_v2, warnings, "CUDA driver version")
            if cuda_v:
                sw.cuda_driver_version = f"{cuda_v // 1000}.{(cuda_v % 1000) // 10}"
            gpus = _read_gpus(nv, warnings)
    if include_torch:
        _torch_info(sw, warnings)

    freq = None
    try:
        f = psutil.cpu_freq()
        freq = float(f.current) if f else None
    except Exception:
        pass
    cpu = CPUInfo(
        model=_cpu_model(),
        architecture=platform.machine() or None,
        physical_cores=psutil.cpu_count(logical=False),
        logical_cores=psutil.cpu_count(logical=True),
        frequency_mhz=freq,
        utilization_percent=psutil.cpu_percent(interval=cpu_sample_s),
    )
    vm, sm = psutil.virtual_memory(), psutil.swap_memory()
    memory = MemoryInfo(total_bytes=vm.total, available_bytes=vm.available, used_bytes=vm.used,
                        percent=vm.percent, swap_total_bytes=sm.total, swap_used_bytes=sm.used)
    paths = list(disk_paths or []) or [Path.home()]
    cuda_ok = bool(gpus) and any(g.vram_total_bytes for g in gpus)
    return HardwareSnapshot(
        captured_at=datetime.now(timezone.utc),
        gpus=gpus,
        cpu=cpu,
        memory=memory,
        disks=disk_info(paths),
        software=sw,
        cuda_available=cuda_ok,
        accelerator="cuda" if cuda_ok else "cpu",
        warnings=warnings,
    )


class GPUSample(BaseModel):
    used_bytes: int | None = None
    energy_mj: int | None = None
    power_w: float | None = None


def sample_gpu(index: int = 0) -> GPUSample:
    """Cheap single-GPU sample used by benchmark monitors. Returns empty sample without NVML."""
    with nvml_session() as nv:
        if nv is None:
            return GPUSample()
        try:
            h = nv.nvmlDeviceGetHandleByIndex(index)
        except Exception:
            return GPUSample()
        s = GPUSample()
        try:
            s.used_bytes = int(nv.nvmlDeviceGetMemoryInfo(h).used)
        except Exception:
            pass
        try:
            s.energy_mj = int(nv.nvmlDeviceGetTotalEnergyConsumption(h))
        except Exception:
            pass
        try:
            s.power_w = nv.nvmlDeviceGetPowerUsage(h) / 1000.0
        except Exception:
            pass
        return s


def hardware_fingerprint(snap: HardwareSnapshot) -> str:
    """Stable identifier of a hardware configuration (for benchmark comparability)."""
    import hashlib

    parts = [snap.cpu.model or "?", str(snap.cpu.logical_cores), str(snap.memory.total_bytes // 2**30),
             snap.software.os, snap.software.nvidia_driver_version or "-"]
    parts += [f"{g.name}:{g.vram_total_bytes}" for g in snap.gpus]
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:16]


if __name__ == "__main__":  # pragma: no cover
    print(collect_hardware([Path(os.getcwd())]).model_dump_json(indent=2))
