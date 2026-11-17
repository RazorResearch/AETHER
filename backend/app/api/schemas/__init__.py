"""Public API schemas (the contract with the frontend — see docs/API_CONTRACT.md)."""

from __future__ import annotations

from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, Field

from app.core.analyzer import ModelAnalysis
from app.engines.base import EngineStatus

T = TypeVar("T")

JobStatus = Literal["queued", "running", "completed", "failed", "cancelled"]


class ErrorBody(BaseModel):
    code: str = Field(examples=["NOT_FOUND"])
    message: str
    details: Any = None


class ErrorResponse(BaseModel):
    error: ErrorBody


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


# ---------------------------------------------------------------- system
class HealthResponse(BaseModel):
    status: Literal["ok"]
    engine: str
    version: str
    schema_version: int
    engines: list[EngineStatus]


# ---------------------------------------------------------------- models
class ModelSummary(BaseModel):
    id: str
    name: str
    path: str
    format: Literal["gguf", "safetensors"]
    architecture: str | None
    n_params: int | None
    file_size_bytes: int
    quantization: str | None
    context_length: int | None
    fingerprint: str | None
    status: Literal["available", "missing"]
    created_at: str
    updated_at: str


class ModelDetail(ModelSummary):
    analysis: ModelAnalysis | None


class ModelImportRequest(BaseModel):
    path: str = Field(description="Absolute path of a local .gguf / .safetensors file. Never downloaded.")
    name: str | None = None


class ModelScanRequest(BaseModel):
    directories: list[str] | None = Field(None, description="Defaults to AETHER_MODEL_DIRS.")
    max_depth: int = Field(3, ge=1, le=10)


class ModelScanResponse(BaseModel):
    imported: list[ModelSummary]
    skipped: list[str]
    errors: list[dict]


# ---------------------------------------------------------------- jobs
class JobSummary(BaseModel):
    id: str
    status: JobStatus
    progress: float
    stage: str | None
    error: dict | None = None


class Job(BaseModel):
    id: str
    kind: str
    status: JobStatus
    progress: float = Field(ge=0, le=1)
    stage: str | None
    params: dict
    error: dict | None
    created_at: str
    started_at: str | None
    finished_at: str | None
    updated_at: str


class JobResults(BaseModel):
    job_id: str
    status: JobStatus
    result: dict | None


# ---------------------------------------------------------------- experiments
ExperimentStatus = Literal["draft", "queued", "running", "completed", "failed", "cancelled"]


class ExperimentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    type: str = Field(description="One of GET /api/v1/experiments/types ids.")
    hypothesis: str | None = None
    config: dict = Field(default_factory=dict)


class ExperimentStart(BaseModel):
    confirm: bool = Field(False, description="Required for experiments whose cost is 'expensive'.")


class Experiment(BaseModel):
    id: str
    name: str
    type: str
    model_id: str | None
    hypothesis: str | None
    status: ExperimentStatus
    config: dict
    result: dict | None
    job_id: str | None
    job: JobSummary | None = None
    created_at: str
    updated_at: str


class ExperimentType(BaseModel):
    id: str
    name: str
    description: str
    cost: Literal["cheap", "moderate", "expensive"]
    requires: list[str]
    config_schema: dict


# ---------------------------------------------------------------- benchmarks
class Benchmark(BaseModel):
    id: str
    model_id: str | None
    experiment_id: str | None
    hardware_profile_id: str | None
    engine: str
    engine_version: str | None
    status: JobStatus
    spec: dict
    record: dict | None
    job_id: str | None
    created_at: str
    updated_at: str


class BenchmarkComparison(BaseModel):
    comparable: bool
    issues: list[str]


# ---------------------------------------------------------------- activity
class ActivityEntry(BaseModel):
    id: str
    timestamp: str
    category: Literal["system", "model", "experiment", "benchmark", "optimization", "hardware"]
    type: str
    message: str
    status: Literal["info", "success", "warning", "error"]
    details: dict | None


# ---------------------------------------------------------------- optimization
class ProfileOut(BaseModel):
    id: str
    name: str
    description: str
    weights: dict[str, float]
