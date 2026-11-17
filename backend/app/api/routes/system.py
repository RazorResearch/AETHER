from __future__ import annotations

from fastapi import APIRouter, Depends

from app import ENGINE_NAME, __version__
from app.api.deps import services
from app.api.schemas import HealthResponse
from app.core.hardware import HardwareSnapshot
from app.engines.base import EngineStatus
from app.services.container import Services

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/health", response_model=HealthResponse, summary="Engine liveness and engine availability")
def health(s: Services = Depends(services)):
    cfg = s.settings
    return HealthResponse(status="ok", engine=ENGINE_NAME, version=__version__,
                          schema_version=s.db.schema_version(),
                          engines=[e.status() for e in s.engines().values()],
                          config={"data_dir": str(cfg.data_dir), "db_path": str(cfg.db_path),
                                  "model_dirs": [str(d) for d in cfg.model_dirs],
                                  "llamacpp_dir": str(cfg.llamacpp_dir) if cfg.llamacpp_dir else None,
                                  "max_concurrent_jobs": cfg.max_concurrent_jobs})


@router.get("/hardware", response_model=HardwareSnapshot,
            summary="Live hardware snapshot (GPU via NVML, CPU, RAM, disks, CUDA/driver versions)")
def hardware(s: Services = Depends(services)):
    """Values that cannot be read are `null` and explained in `warnings`. Nothing is simulated."""
    return s.hardware()


@router.get("/engines", response_model=list[EngineStatus], summary="Inference engine availability")
def engines(s: Services = Depends(services)):
    return [e.status() for e in s.engines().values()]
