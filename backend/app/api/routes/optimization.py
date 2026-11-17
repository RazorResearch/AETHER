from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.deps import optimization, page, services
from app.api.schemas import Job, JobResults, Page, ProfileOut
from app.services.container import Services
from app.services.optimization import EstimateRequest, OptimizationService, StartRequest

router = APIRouter(prefix="/optimization", tags=["optimization"])


@router.get("/profiles", response_model=list[ProfileOut], summary="Optimization profiles and objective weights")
def profiles(svc: OptimizationService = Depends(optimization)):
    return svc.profiles()


@router.post("/estimate", summary="Estimate memory placement, KV cache and quantization sizes (no execution)")
def estimate(body: EstimateRequest, svc: OptimizationService = Depends(optimization)) -> dict:
    """Pure estimation on the detected hardware. Every number is flagged `is_estimate: true`."""
    return svc.estimate(body)


@router.post("/start", response_model=Job, status_code=202, summary="Start a configuration search job")
def start(body: StartRequest, svc: OptimizationService = Depends(optimization)):
    return svc.start(body)


@router.get("/jobs", response_model=Page[Job], summary="List jobs (all kinds)")
def jobs(kind: str | None = None, status: str | None = None, limit: int = Query(100, ge=1, le=500),
         offset: int = Query(0, ge=0), s: Services = Depends(services)):
    items, total = s.jobs.list(kind, status, limit, offset)
    return page(items, total, limit, offset)


@router.get("/{job_id}", response_model=Job, summary="Job status and progress (poll this)")
def get_job(job_id: str, s: Services = Depends(services)):
    return s.jobs.get(job_id)


@router.get("/{job_id}/results", response_model=JobResults, summary="Job result (null until completed)")
def results(job_id: str, s: Services = Depends(services)):
    j = s.jobs.get(job_id)
    return JobResults(job_id=j["id"], status=j["status"], result=j["result"] if j["status"] == "completed" else None)


@router.post("/{job_id}/cancel", response_model=Job, summary="Request cancellation of a queued/running job")
def cancel(job_id: str, s: Services = Depends(services)):
    return s.jobs.cancel(job_id)
