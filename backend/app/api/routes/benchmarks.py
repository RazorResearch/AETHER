from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.deps import benchmarks, page
from app.api.schemas import Benchmark, BenchmarkComparison, Page
from app.benchmarks.records import BenchmarkSpec
from app.services.benchmarks import BenchmarkService

router = APIRouter(prefix="/benchmarks", tags=["benchmarks"])


@router.get("", response_model=Page[Benchmark], summary="List benchmark runs")
def list_benchmarks(model_id: str | None = None, experiment_id: str | None = None, status: str | None = None,
                    limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0),
                    svc: BenchmarkService = Depends(benchmarks)):
    items, total = svc.list(model_id, experiment_id, status, limit, offset)
    return page(items, total, limit, offset)


@router.post("", response_model=Benchmark, status_code=202, summary="Queue a benchmark run (llama-bench)")
def create(spec: BenchmarkSpec, svc: BenchmarkService = Depends(benchmarks)):
    """Returns **503 ENGINE_UNAVAILABLE** if llama.cpp binaries are not installed."""
    return svc.create(spec)


@router.get("/compare", response_model=BenchmarkComparison,
            summary="Check whether two benchmark records were obtained in comparable conditions")
def compare(a: str, b: str, svc: BenchmarkService = Depends(benchmarks)):
    return svc.compare(a, b)


@router.get("/{benchmark_id}", response_model=Benchmark, summary="Benchmark run with full record")
def get(benchmark_id: str, svc: BenchmarkService = Depends(benchmarks)):
    return svc.get(benchmark_id)
