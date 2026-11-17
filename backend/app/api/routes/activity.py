from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.deps import page, services
from app.api.schemas import ActivityEntry, Page
from app.services.container import Services

router = APIRouter(prefix="/activity", tags=["activity"])


@router.get("", response_model=Page[ActivityEntry], summary="Engine activity log (most recent first)")
def list_activity(category: str | None = None, status: str | None = None,
                  limit: int = Query(100, ge=1, le=1000), offset: int = Query(0, ge=0),
                  s: Services = Depends(services)):
    items, total = s.activity.list(category, status, limit, offset)
    return page(items, total, limit, offset)
