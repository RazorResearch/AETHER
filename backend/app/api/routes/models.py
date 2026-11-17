from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response

from app.api.deps import page, services
from app.api.schemas import (ModelDetail, ModelImportRequest, ModelScanRequest, ModelScanResponse,
                             ModelSummary, Page)
from app.core.analyzer import ModelAnalysis
from app.services.container import Services

router = APIRouter(prefix="/models", tags=["models"])


def _summary(m: dict) -> dict:
    return {k: v for k, v in m.items() if k != "analysis"}


@router.get("", response_model=Page[ModelSummary], summary="List registered local models")
def list_models(format: str | None = Query(None, pattern="^(gguf|safetensors)$"),
                limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0),
                s: Services = Depends(services)):
    items, total = s.models.list(format, limit, offset)
    return page([_summary(m) for m in items], total, limit, offset)


@router.post("/import", response_model=ModelDetail, status_code=201,
             summary="Register a local model file (no copy, no download)")
def import_model(body: ModelImportRequest, s: Services = Depends(services)):
    return s.models.import_model(body.path, body.name)


@router.post("/scan", response_model=ModelScanResponse, summary="Register every model found in directories")
def scan(body: ModelScanRequest, s: Services = Depends(services)):
    from pathlib import Path

    res = s.models.scan([Path(d) for d in body.directories] if body.directories else None, body.max_depth)
    return {**res, "imported": [_summary(m) for m in res["imported"]]}


@router.get("/{model_id}", response_model=ModelDetail, summary="Model details with extracted analysis")
def get_model(model_id: str, s: Services = Depends(services)):
    return s.models.get(model_id)


@router.get("/{model_id}/analysis", response_model=ModelAnalysis,
            summary="Re-read the model file (optionally with per-tensor detail)")
def analysis(model_id: str, include_tensors: bool = False, s: Services = Depends(services)):
    return s.models.analysis(model_id, include_tensors=include_tensors)


@router.delete("/{model_id}", status_code=204, summary="Remove from library (file on disk is NOT deleted)")
def delete_model(model_id: str, s: Services = Depends(services)):
    s.models.remove(model_id)
    return Response(status_code=204)
