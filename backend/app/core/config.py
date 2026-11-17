"""Engine configuration.

Configuration is read from environment variables (prefix ``AETHER_``) so the
engine never depends on frontend files. Configuration (this module) is kept
separate from experimental data (SQLite database in ``data_dir``).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _split_paths(value: str | None) -> tuple[Path, ...]:
    if not value:
        return ()
    return tuple(Path(p).expanduser() for p in value.split(os.pathsep) if p.strip())


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    db_path: Path
    model_dirs: tuple[Path, ...] = ()
    llamacpp_dir: Path | None = None
    cors_origins: tuple[str, ...] = (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "tauri://localhost",
    )
    # One heavy job at a time: the reference machine has 8 GB VRAM / 16 GB RAM.
    max_concurrent_jobs: int = 1
    # Safety margins used by the memory planner (bytes).
    vram_safety_margin: int = 512 * 1024**2
    ram_safety_margin: int = 1536 * 1024**2
    # Assumed CUDA context + driver overhead per process (bytes). Heuristic,
    # documented in docs/OPTIMIZATION_METHODS.md; to be calibrated by measurement.
    cuda_context_overhead: int = 400 * 1024**2
    subprocess_timeout_s: int = 3600
    extra: dict[str, str] = field(default_factory=dict)

    def ensure_dirs(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        (self.data_dir / "artifacts").mkdir(exist_ok=True)

    @property
    def artifacts_dir(self) -> Path:
        return self.data_dir / "artifacts"


def load_settings(**overrides) -> Settings:
    data_dir = Path(os.environ.get("AETHER_DATA_DIR", Path.home() / ".aether")).expanduser()
    db_path = Path(os.environ.get("AETHER_DB_PATH", data_dir / "aether.db")).expanduser()
    llama = os.environ.get("AETHER_LLAMACPP_DIR")
    cors = os.environ.get("AETHER_CORS_ORIGINS")
    kwargs: dict = dict(
        data_dir=data_dir,
        db_path=db_path,
        model_dirs=_split_paths(os.environ.get("AETHER_MODEL_DIRS")),
        llamacpp_dir=Path(llama).expanduser() if llama else None,
    )
    if cors:
        kwargs["cors_origins"] = tuple(o.strip() for o in cors.split(",") if o.strip())
    kwargs.update(overrides)
    return Settings(**kwargs)
