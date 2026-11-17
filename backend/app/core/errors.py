"""Explicit, typed engine errors.

Every error carries a stable machine-readable ``code`` that the API exposes
unchanged (see docs/API_CONTRACT.md, section "Errors").
"""

from __future__ import annotations

from typing import Any


class AetherError(Exception):
    status_code = 400
    code = "AETHER_ERROR"

    def __init__(self, message: str, *, code: str | None = None, details: Any = None,
                 status_code: int | None = None):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code
        self.details = details


class NotFoundError(AetherError):
    status_code = 404
    code = "NOT_FOUND"


class ValidationFailed(AetherError):
    status_code = 422
    code = "VALIDATION_ERROR"


class ConflictError(AetherError):
    status_code = 409
    code = "CONFLICT"


class ConfirmationRequired(AetherError):
    """Raised before launching an expensive operation without explicit consent."""

    status_code = 409
    code = "CONFIRMATION_REQUIRED"


class UnsupportedFormatError(AetherError):
    status_code = 415
    code = "UNSUPPORTED_FORMAT"


class EngineUnavailableError(AetherError):
    """A required backend (llama.cpp binary, PyTorch, NVML...) is not installed."""

    status_code = 503
    code = "ENGINE_UNAVAILABLE"


class FeatureNotImplemented(AetherError):
    status_code = 501
    code = "NOT_IMPLEMENTED"


class ResourceLimitError(AetherError):
    """The operation would exceed the detected memory/disk budget."""

    status_code = 507
    code = "INSUFFICIENT_RESOURCES"


class ExecutionError(AetherError):
    status_code = 500
    code = "EXECUTION_FAILED"
