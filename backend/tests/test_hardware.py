import builtins

from app.core import hardware
from app.core.hardware import collect_hardware, hardware_fingerprint
from tests.helpers import fake_hardware


def test_collect_hardware_real_machine(tmp_path):
    snap = collect_hardware([tmp_path], include_torch=False, cpu_sample_s=0.0)
    assert snap.memory.total_bytes > 0
    assert snap.cpu.logical_cores and snap.cpu.logical_cores > 0
    assert snap.accelerator in ("cuda", "cpu")
    assert snap.disks and snap.disks[0].total_bytes > 0
    for g in snap.gpus:  # whatever is reported must be real, never placeholders
        assert g.name is None or isinstance(g.name, str)
        if g.vram_total_bytes is not None:
            assert g.vram_total_bytes > 0


def test_collect_hardware_without_nvml(monkeypatch, tmp_path):
    real_import = builtins.__import__

    def no_pynvml(name, *a, **k):
        if name == "pynvml":
            raise ImportError("simulated: nvidia-ml-py missing")
        return real_import(name, *a, **k)

    monkeypatch.setattr(builtins, "__import__", no_pynvml)
    snap = collect_hardware([tmp_path], include_torch=False, cpu_sample_s=0.0)
    assert snap.gpus == []
    assert snap.cuda_available is False and snap.accelerator == "cpu"
    assert snap.software.nvidia_driver_version is None and snap.software.cuda_driver_version is None
    assert any("nvidia-ml-py" in w for w in snap.warnings)


def test_nvml_init_failure(monkeypatch, tmp_path):
    import pynvml

    def boom():
        raise pynvml.NVMLError(pynvml.NVML_ERROR_DRIVER_NOT_LOADED)

    monkeypatch.setattr(pynvml, "nvmlInit", boom)
    snap = collect_hardware([tmp_path], include_torch=False, cpu_sample_s=0.0)
    assert snap.gpus == [] and snap.accelerator == "cpu"
    assert any("NVML unavailable" in w for w in snap.warnings)


def test_sample_gpu_never_raises():
    s = hardware.sample_gpu(0)
    assert s.used_bytes is None or s.used_bytes >= 0


def test_fingerprint_stable_and_sensitive():
    a, b = fake_hardware(gpu=True), fake_hardware(gpu=True, vram_free=1)
    assert hardware_fingerprint(a) == hardware_fingerprint(b)  # free memory does not change identity
    assert hardware_fingerprint(a) != hardware_fingerprint(fake_hardware(gpu=False))
