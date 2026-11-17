"""AETHER engine — FastAPI application.

Run:  uvicorn app.main:app --host 127.0.0.1 --port 8765
Docs: http://127.0.0.1:8765/docs   OpenAPI: /api/v1/openapi.json
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import __version__
from app.api.routes import activity, benchmarks, experiments, models, optimization, system
from app.api.schemas import ErrorResponse
from app.core.config import Settings, load_settings
from app.core.errors import AetherError
from app.services.container import Services

API_PREFIX = "/api/v1"


def _err(status: int, code: str, message: str, details=None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message,
                                                                "details": details}})


def create_app(settings: Settings | None = None, services: Services | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if getattr(app.state, "services", None) is None:
            app.state.services = Services(settings or load_settings())
        app.state.services.activity.log("system", "engine.started", f"AETHER engine {__version__} started")
        yield
        app.state.services.shutdown()

    app = FastAPI(
        title="AETHER Engine API",
        version=__version__,
        description="Backend engine of AETHER (RazorResearch). Contract: docs/API_CONTRACT.md",
        openapi_url=f"{API_PREFIX}/openapi.json",
        lifespan=lifespan,
        responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 422: {"model": ErrorResponse},
                   500: {"model": ErrorResponse}},
    )
    app.state.services = services
    cfg = services.settings if services else (settings or load_settings())
    app.add_middleware(CORSMiddleware, allow_origins=list(cfg.cors_origins), allow_credentials=False,
                       allow_methods=["*"], allow_headers=["*"])

    @app.exception_handler(AetherError)
    async def aether_error(_: Request, exc: AetherError):
        return _err(exc.status_code, exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        return _err(422, "VALIDATION_ERROR", "Request validation failed",
                    [{"loc": e.get("loc"), "msg": e.get("msg"), "type": e.get("type")} for e in exc.errors()])

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException):
        code = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}.get(exc.status_code, "HTTP_ERROR")
        return _err(exc.status_code, code, str(exc.detail))

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):
        return _err(500, "INTERNAL_ERROR", f"{type(exc).__name__}: {exc}")

    for r in (system, models, experiments, benchmarks, activity, optimization):
        app.include_router(r.router, prefix=API_PREFIX)
    return app


app = create_app()
