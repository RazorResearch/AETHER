"""Chat & live inference endpoints (/api/v1/chat/...).

Generation is streamed with Server-Sent Events; see docs/API_CONTRACT.md §8.
"""

from __future__ import annotations

import asyncio
import json
import queue

from fastapi import APIRouter, Body, Depends, Query, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.deps import chat, compare, profiles, services
from app.engines.llama_server import RuntimeConfig
from app.services.chat import END, ChatService, GenerateRequest
from app.services.chat_compare import CompareRequest, CompareService
from app.services.chat_profiles import ProfileIn, ProfilePatch, ProfileService
from app.services.container import Services

router = APIRouter(prefix="/chat", tags=["chat"])


class LoadRequest(BaseModel):
    model_id: str
    runtime: RuntimeConfig = RuntimeConfig()


class SessionIn(BaseModel):
    title: str | None = Field(None, max_length=200)
    model_id: str | None = None


class SessionPatch(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class StopIn(BaseModel):
    generation_id: str | None = None


# ----------------------------------------------------------------- models / runtime
@router.get("/models", summary="Models the chat can serve, with runtime state and backend capabilities")
def chat_models(svc: ChatService = Depends(chat)) -> dict:
    return svc.models()


@router.get("/runtime", summary="State of the resident llama-server (loading/ready/…, measured placement)")
def runtime_status(svc: ChatService = Depends(chat)) -> dict:
    return svc.runtime.status().model_dump()


@router.post("/runtime/load", summary="Load a model with a runtime configuration (blocks until ready)")
def runtime_load(body: LoadRequest, svc: ChatService = Depends(chat), s: Services = Depends(services)) -> dict:
    m = s.models.get(body.model_id)
    svc.validate(m, body.runtime)
    st = svc.runtime.load(m["id"], m["path"], body.runtime)
    s.activity.log("model", "chat.model_loaded", f"{m['name']} loaded in llama-server ({st.load_time_s}s)",
                   "success", {"model_id": m["id"], "placement": st.placement.model_dump()})
    return st.model_dump()


@router.post("/runtime/unload", summary="Unload the resident model (frees VRAM)")
def runtime_unload(svc: ChatService = Depends(chat)) -> dict:
    return svc.runtime.unload().model_dump()


# ----------------------------------------------------------------------- sessions
@router.get("/sessions", summary="Conversations, most recent first")
def list_sessions(limit: int = Query(200, ge=1, le=1000), offset: int = Query(0, ge=0),
                  svc: ChatService = Depends(chat)) -> dict:
    items, total = svc.list_sessions(limit, offset)
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.post("/sessions", status_code=201, summary="Create an empty conversation")
def create_session(body: SessionIn = Body(default_factory=SessionIn), svc: ChatService = Depends(chat)) -> dict:
    return svc.create_session(body.title, body.model_id)


@router.get("/sessions/{session_id}", summary="Conversation with all messages and their metrics")
def get_session(session_id: str, svc: ChatService = Depends(chat)) -> dict:
    return svc.get_session(session_id)


@router.patch("/sessions/{session_id}", summary="Rename a conversation")
def rename_session(session_id: str, body: SessionPatch, svc: ChatService = Depends(chat)) -> dict:
    return svc.rename_session(session_id, body.title)


@router.delete("/sessions/{session_id}", status_code=204, summary="Delete a conversation and its messages")
def delete_session(session_id: str, svc: ChatService = Depends(chat)):
    svc.delete_session(session_id)
    return Response(status_code=204)


# --------------------------------------------------------------------- generation
@router.post("/generate", summary="Generate an answer (Server-Sent Events stream)",
             response_description="text/event-stream: session, status, token, reasoning, metrics, done, error")
async def generate(body: GenerateRequest, request: Request, svc: ChatService = Depends(chat)):
    """Validation errors are returned as normal JSON errors before the stream starts.

    Closing the connection stops the generation on the backend.
    """
    q, live = await asyncio.to_thread(svc.start, body)

    async def events():
        try:
            while True:
                try:
                    item = await asyncio.to_thread(q.get, True, 0.5)
                except queue.Empty:
                    if await request.is_disconnected():
                        live.cancel.set()
                        return
                    yield ": keep-alive\n\n"
                    continue
                if item is END:
                    return
                kind, data = item
                yield f"event: {kind}\ndata: {json.dumps(data, default=str)}\n\n"
        finally:
            if live.status in ("starting", "loading", "generating"):
                live.cancel.set()

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/stop", summary="Stop the generation in progress (aborts llama-server work)")
def stop(body: StopIn = Body(default_factory=StopIn), svc: ChatService = Depends(chat)) -> dict:
    return svc.stop(body.generation_id)


@router.get("/metrics", summary="Live snapshot: runtime state + current generation metrics + last hardware sample")
def metrics(svc: ChatService = Depends(chat)) -> dict:
    return svc.live_metrics()


@router.get("/performance", summary="Performance history of past answers (metrics stored per message)")
def performance(model_id: str | None = None, limit: int = Query(100, ge=1, le=1000),
                svc: ChatService = Depends(chat)) -> list[dict]:
    return svc.performance_history(model_id, limit)


# ----------------------------------------------------------------------- profiles
@router.get("/profiles", summary="Saved inference configuration profiles")
def list_profiles(svc: ProfileService = Depends(profiles)) -> list[dict]:
    return svc.list()


@router.post("/profiles", status_code=201, summary="Save a profile")
def create_profile(body: ProfileIn, svc: ProfileService = Depends(profiles)) -> dict:
    return svc.create(body)


@router.patch("/profiles/{profile_id}", summary="Rename or update a profile")
def update_profile(profile_id: str, body: ProfilePatch, svc: ProfileService = Depends(profiles)) -> dict:
    return svc.update(profile_id, body)


@router.post("/profiles/{profile_id}/duplicate", status_code=201, summary="Duplicate a profile")
def duplicate_profile(profile_id: str, svc: ProfileService = Depends(profiles)) -> dict:
    return svc.duplicate(profile_id)


@router.delete("/profiles/{profile_id}", status_code=204, summary="Delete a profile")
def delete_profile(profile_id: str, svc: ProfileService = Depends(profiles)):
    svc.delete(profile_id)
    return Response(status_code=204)


@router.get("/presets", summary="Hardware-aware starting presets for a model (memory figures are estimates)")
def presets(model_id: str, svc: ProfileService = Depends(profiles)) -> dict:
    return svc.presets(model_id)


# ------------------------------------------------------------------------ compare
@router.post("/compare", status_code=202, summary="Benchmark one prompt across 2-4 configurations (job)")
def start_compare(body: CompareRequest, svc: CompareService = Depends(compare)) -> dict:
    return svc.start(body)


@router.get("/compare", summary="Past configuration comparisons")
def list_compare(limit: int = Query(50, ge=1, le=500), svc: CompareService = Depends(compare)) -> list[dict]:
    return svc.list(limit)


@router.get("/compare/{comparison_id}", summary="Comparison with job progress and results")
def get_compare(comparison_id: str, svc: CompareService = Depends(compare)) -> dict:
    return svc.get(comparison_id)
