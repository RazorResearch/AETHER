from __future__ import annotations

from fastapi import Request

from app.services.benchmarks import BenchmarkService
from app.services.container import Services
from app.services.experiments import ExperimentService
from app.services.optimization import OptimizationService


def services(request: Request) -> Services:
    return request.app.state.services


def experiments(request: Request) -> ExperimentService:
    return ExperimentService(request.app.state.services)


def benchmarks(request: Request) -> BenchmarkService:
    return BenchmarkService(request.app.state.services)


def optimization(request: Request) -> OptimizationService:
    return OptimizationService(request.app.state.services)


def page(items: list, total: int, limit: int, offset: int) -> dict:
    return {"items": items, "total": total, "limit": limit, "offset": offset}


def chat(request: Request):
    from app.services.chat import ChatService

    s = request.app.state.services
    return s.singleton("chat", lambda: ChatService(s))


def profiles(request: Request):
    from app.services.chat_profiles import ProfileService

    return ProfileService(request.app.state.services)


def compare(request: Request):
    from app.services.chat_compare import CompareService

    return CompareService(request.app.state.services)
