"""Service container wiring settings, database, engines and services together."""

from __future__ import annotations

from pathlib import Path

from app.core.config import Settings
from app.core.hardware import HardwareSnapshot, collect_hardware, hardware_fingerprint
from app.core.model_manager import ModelManager
from app.database.db import Database, new_id, utcnow
from app.engines.base import InferenceEngine
from app.engines.llama_server import LlamaServerRuntime
from app.engines.llamacpp import LlamaCppEngine
from app.engines.pytorch import PyTorchEngine
from app.optimizations.memory.planner import MemoryBudget
from app.services.activity import ActivityLog
from app.services.jobs import JobManager


class Services:
    def __init__(self, settings: Settings, llamacpp: LlamaCppEngine | None = None,
                 hardware_provider=None):
        self.settings = settings
        settings.ensure_dirs()
        self.db = Database(settings.db_path)
        self.db.migrate()
        self.activity = ActivityLog(self.db)
        self.models = ModelManager(self.db, self.activity, settings.model_dirs)
        self.jobs = JobManager(self.db, self.activity, settings.max_concurrent_jobs)
        self.llamacpp = llamacpp or LlamaCppEngine(settings.llamacpp_dir, timeout_s=settings.subprocess_timeout_s)
        self.pytorch = PyTorchEngine()
        # interactive inference: one resident llama-server process (8 GB VRAM target)
        self.chat_runtime = LlamaServerRuntime(self.llamacpp.binaries.get("llama-server"))
        self._singletons: dict = {}
        self._hardware_provider = hardware_provider or (
            lambda: collect_hardware(self.disk_paths()))
        recovered = self.jobs.recover()
        if recovered:
            self.activity.log("system", "jobs.recovered",
                              f"{recovered} job(s) interrupted by a previous shutdown marked as failed", "warning")

    def engines(self) -> dict[str, InferenceEngine]:
        return {"llama.cpp": self.llamacpp, "pytorch": self.pytorch}

    def engine(self, name: str) -> InferenceEngine:
        from app.core.errors import ValidationFailed

        e = self.engines().get(name)
        if e is None:
            raise ValidationFailed(f"Unknown engine '{name}'", details={"available": list(self.engines())})
        return e

    def disk_paths(self) -> list[Path]:
        return [self.settings.data_dir, *self.settings.model_dirs]

    def hardware(self) -> HardwareSnapshot:
        return self._hardware_provider()

    def record_hardware_profile(self, snap: HardwareSnapshot | None = None) -> tuple[str, HardwareSnapshot]:
        snap = snap or self.hardware()
        fp = hardware_fingerprint(snap)
        row = self.db.insert("hardware_profiles", {"id": new_id("hw"), "fingerprint": fp,
                                                   "snapshot": snap.model_dump(mode="json"), "created_at": utcnow()})
        return row["id"], snap

    def memory_budget(self, snap: HardwareSnapshot, max_vram_bytes: int | None = None,
                      max_ram_bytes: int | None = None) -> MemoryBudget:
        vram = None
        if snap.cuda_available and snap.gpus and snap.gpus[0].vram_free_bytes is not None:
            vram = snap.gpus[0].vram_free_bytes
            if max_vram_bytes is not None:
                vram = min(vram, max_vram_bytes)
        ram = snap.memory.available_bytes
        if max_ram_bytes is not None:
            ram = min(ram, max_ram_bytes)
        s = self.settings
        return MemoryBudget(vram_available_bytes=vram, ram_available_bytes=ram,
                            vram_safety_margin_bytes=s.vram_safety_margin,
                            ram_safety_margin_bytes=s.ram_safety_margin,
                            cuda_context_overhead_bytes=s.cuda_context_overhead)

    def singleton(self, key: str, factory):
        if key not in self._singletons:
            self._singletons[key] = factory()
        return self._singletons[key]

    def shutdown(self) -> None:
        self.jobs.shutdown()
        self.chat_runtime.shutdown()
