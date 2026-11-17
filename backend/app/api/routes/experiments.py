from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Query, Response

from app.api.deps import experiments, page
from app.api.schemas import Experiment, ExperimentCreate, ExperimentStart, ExperimentType, Page
from app.services.experiments import ExperimentService

router = APIRouter(prefix="/experiments", tags=["experiments"])


@router.get("", response_model=Page[Experiment], summary="List experiments")
def list_experiments(status: str | None = None, type: str | None = None,
                     limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0),
                     svc: ExperimentService = Depends(experiments)):
    items, total = svc.list(status, type, limit, offset)
    return page(items, total, limit, offset)


@router.get("/types", response_model=list[ExperimentType], summary="Available experiment types + config schemas")
def types(svc: ExperimentService = Depends(experiments)):
    return svc.types()


@router.post("", response_model=Experiment, status_code=201, summary="Create an experiment (status 'draft')")
def create(body: ExperimentCreate, svc: ExperimentService = Depends(experiments)):
    return svc.create(body.name, body.type, body.config, body.hypothesis)


@router.get("/{experiment_id}", response_model=Experiment, summary="Experiment with job progress and result")
def get(experiment_id: str, svc: ExperimentService = Depends(experiments)):
    return svc.get(experiment_id)


@router.post("/{experiment_id}/start", response_model=Experiment, status_code=202,
             summary="Start an experiment as a background job")
def start(experiment_id: str, body: ExperimentStart = Body(default_factory=ExperimentStart),
          svc: ExperimentService = Depends(experiments)):
    """Expensive experiment types return **409 CONFIRMATION_REQUIRED** unless `confirm` is true."""
    return svc.start(experiment_id, body.confirm)


@router.delete("/{experiment_id}", status_code=204, summary="Delete an experiment (not while running)")
def delete(experiment_id: str, svc: ExperimentService = Depends(experiments)):
    """Benchmarks produced by the experiment are kept (their `experiment_id` becomes null)."""
    svc.delete(experiment_id)
    return Response(status_code=204)
