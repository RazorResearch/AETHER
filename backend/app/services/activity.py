"""Activity log service (engine-side audit trail exposed at GET /api/v1/activity)."""

from __future__ import annotations

from typing import Any

from app.database.db import Database, new_id, utcnow

CATEGORIES = {"system", "model", "experiment", "benchmark", "optimization", "hardware"}
STATUSES = {"info", "success", "warning", "error"}


class ActivityLog:
    def __init__(self, db: Database):
        self.db = db

    def log(self, category: str, type_: str, message: str, status: str = "info",
            details: dict[str, Any] | None = None) -> dict:
        assert category in CATEGORIES, category
        assert status in STATUSES, status
        return self.db.insert("activity_logs", {
            "id": new_id("act"), "timestamp": utcnow(), "category": category, "type": type_,
            "message": message, "status": status, "details": details,
        })

    def list(self, category: str | None = None, status: str | None = None, limit: int = 100,
             offset: int = 0) -> tuple[list[dict], int]:
        return self.db.list("activity_logs", {"category": category, "status": status},
                            order="timestamp DESC", limit=limit, offset=offset)
