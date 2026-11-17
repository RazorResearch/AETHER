"""Chat service: conversations, streamed generation and live inference metrics.

Generation runs in a worker thread that pushes events to a queue; the API
turns them into Server-Sent Events. Event types (see docs/API_CONTRACT.md):

``session`` · ``status`` · ``token`` · ``reasoning`` · ``metrics`` · ``done`` · ``error``

Every metric is either measured by AETHER (wall clock, NVML, psutil) or
reported by llama.cpp itself (``timings``); each carries its source.
"""

from __future__ import annotations

import queue
import threading
import time
from collections import deque
from datetime import datetime, timezone

from pydantic import BaseModel, Field

from app.core.errors import AetherError, ConflictError, NotFoundError, ValidationFailed
from app.database.db import new_id, utcnow
from app.engines.live_sampler import HwSample, LiveSampler
from app.engines.llama_server import RuntimeConfig, SamplingParams
from app.services.container import Services

END = object()


class GenerateRequest(BaseModel):
    model_id: str
    session_id: str | None = Field(None, description="None creates a new conversation.")
    content: str | None = Field(None, max_length=200_000, description="New user message.")
    edit_message_id: str | None = Field(None, description="Replace this user message and drop what follows.")
    regenerate: bool = Field(False, description="Drop the last assistant answer and generate it again.")
    system_prompt: str | None = Field(None, max_length=20_000)
    generation: SamplingParams = SamplingParams()
    runtime: RuntimeConfig = RuntimeConfig()
    profile_id: str | None = None


class LiveState:
    """Mutable state of the generation in progress (read by GET /chat/metrics)."""

    def __init__(self, generation_id: str, model_id: str):
        self.generation_id = generation_id
        self.model_id = model_id
        self.status = "starting"
        self.t_request: float | None = None
        self.t_first: float | None = None
        self.t_last: float | None = None
        self.tokens = 0
        self.reasoning_tokens = 0
        self.token_times: deque[float] = deque(maxlen=4096)
        self.timeline: list[dict] = []  # [{t, tokens, tps}]
        self.last_hw: HwSample | None = None
        self.cancel = threading.Event()
        self.started_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds")

    def live_tps(self, now: float, window: float = 1.0) -> float | None:
        if self.t_first is None:
            return None
        recent = [t for t in self.token_times if t >= now - window]
        span = min(window, now - self.t_first)
        return round(len(recent) / span, 2) if span > 0.05 else None

    def snapshot(self) -> dict:
        now = time.perf_counter()
        n = self.tokens + self.reasoning_tokens
        return {
            "generation_id": self.generation_id,
            "model_id": self.model_id,
            "status": self.status,
            "started_at": self.started_at,
            "elapsed_ms": round((now - self.t_request) * 1000, 1) if self.t_request else None,
            "ttft_ms": round((self.t_first - self.t_request) * 1000, 1) if self.t_first and self.t_request else None,
            "streamed_tokens": n,
            "live_tokens_per_s": self.live_tps(now),
            "avg_tokens_per_s": (round((n - 1) / (self.t_last - self.t_first), 2)
                                 if n > 1 and self.t_last and self.t_first and self.t_last > self.t_first else None),
            "hardware": self.last_hw.model_dump() if self.last_hw else None,
        }


class ChatService:
    def __init__(self, s: Services):
        self.s = s
        self.runtime = s.chat_runtime
        self._live: LiveState | None = None
        self._live_lock = threading.Lock()

    # ------------------------------------------------------------- models
    def models(self) -> dict:
        st = self.runtime.status()
        items = []
        rows, _ = self.s.models.list(limit=500)
        for m in rows:
            loadable = m["format"] == "gguf" and m["status"] == "available"
            reason = None
            if m["format"] != "gguf":
                reason = "Only GGUF models can be served by llama-server."
            elif m["status"] != "available":
                reason = "File missing on disk."
            analysis = m.get("analysis") or {}
            arch = analysis.get("architecture") or {}
            items.append({
                "id": m["id"], "name": m["name"], "architecture": m["architecture"], "format": m["format"],
                "quantization": m["quantization"], "file_size_bytes": m["file_size_bytes"],
                "n_params": m["n_params"], "context_length": m["context_length"],
                "n_layers": arch.get("n_layers"), "loadable": loadable and self.runtime.available,
                "unavailable_reason": reason if loadable is False else (
                    None if self.runtime.available else "llama-server is not installed."),
                "state": st.state if st.model_id == m["id"] else "unloaded",
                "backend": "llama.cpp (llama-server)",
            })
        return {"items": items, "runtime": st.model_dump(), "backend": self.backend_info()}

    def backend_info(self) -> dict:
        eng = self.s.llamacpp.status()
        hw = self.s.hardware()
        return {
            "name": "llama.cpp (llama-server)",
            "available": self.runtime.available,
            "version": eng.version,
            "kv_cache_types": ["f16", "bf16", "q8_0", "q5_1", "q5_0", "q4_1", "q4_0", "iq4_nl"],
            "flash_attn_modes": ["auto", "on", "off"],
            "max_threads": hw.cpu.logical_cores,
            "gpu": hw.gpus[0].name if hw.gpus else None,
            "accelerator": hw.accelerator,
            "supports": {"seed": True, "min_p": True, "top_k": True, "repeat_penalty": True,
                         "reasoning_stream": True, "stop": True},
        }

    def validate(self, model: dict, req_runtime: RuntimeConfig) -> None:
        if model["format"] != "gguf":
            raise ValidationFailed("Only GGUF models can be served by llama-server.")
        if model["status"] != "available":
            raise ValidationFailed("Model file is missing on disk.")
        req_runtime.validate_types()
        ctx_max = model.get("context_length")
        if ctx_max and req_runtime.n_ctx > ctx_max:
            raise ValidationFailed(f"Context {req_runtime.n_ctx} exceeds the model's training context ({ctx_max}).",
                                   details={"max": ctx_max})
        import psutil

        cores = psutil.cpu_count(logical=True)
        if req_runtime.n_threads and cores and req_runtime.n_threads > cores:
            raise ValidationFailed(f"{req_runtime.n_threads} threads requested; this CPU has {cores} logical cores.")

    # ----------------------------------------------------------- sessions
    def list_sessions(self, limit: int = 200, offset: int = 0):
        with self.s.db.connect() as c:
            rows = c.execute(
                "SELECT s.*, (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id=s.id AND m.role!='system') "
                "AS message_count FROM chat_sessions s ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                (limit, offset)).fetchall()
            total = c.execute("SELECT COUNT(*) FROM chat_sessions").fetchone()[0]
        return [dict(r) for r in rows], total

    def create_session(self, title: str | None = None, model_id: str | None = None) -> dict:
        now = utcnow()
        return self.s.db.insert("chat_sessions", {"id": new_id("chat"), "title": title or "New conversation",
                                                  "model_id": model_id, "created_at": now, "updated_at": now})

    def get_session(self, sid: str) -> dict:
        row = self.s.db.get("chat_sessions", sid)
        if not row:
            raise NotFoundError(f"Conversation '{sid}' not found")
        with self.s.db.connect() as c:
            msgs = [self.s.db.decode(r) for r in
                    c.execute("SELECT * FROM chat_messages WHERE session_id=? ORDER BY seq", (sid,)).fetchall()]
        row["messages"] = msgs
        return row

    def rename_session(self, sid: str, title: str) -> dict:
        self.get_session(sid)
        return self.s.db.update("chat_sessions", sid, {"title": title.strip()[:200] or "Untitled", "updated_at": utcnow()})

    def delete_session(self, sid: str) -> None:
        self.get_session(sid)
        live = self._live
        if live and self.runtime.generating and getattr(live, "session_id", None) == sid:
            raise ConflictError("Stop the running generation before deleting this conversation", code="BUSY")
        self.s.db.delete("chat_sessions", sid)

    def _messages(self, sid: str) -> list[dict]:
        with self.s.db.connect() as c:
            return [self.s.db.decode(r) for r in
                    c.execute("SELECT * FROM chat_messages WHERE session_id=? ORDER BY seq", (sid,)).fetchall()]

    def _add_message(self, sid: str, role: str, content: str, status: str = "complete",
                     metrics: dict | None = None, reasoning: str | None = None) -> dict:
        with self.s.db.connect() as c:
            seq = (c.execute("SELECT COALESCE(MAX(seq), -1) FROM chat_messages WHERE session_id=?",
                             (sid,)).fetchone()[0]) + 1
        return self.s.db.insert("chat_messages", {
            "id": new_id("msg"), "session_id": sid, "seq": seq, "role": role, "content": content,
            "reasoning": reasoning, "status": status, "metrics": metrics, "created_at": utcnow()})

    def _truncate_from(self, sid: str, seq: int) -> None:
        with self.s.db.connect() as c:
            c.execute("DELETE FROM chat_messages WHERE session_id=? AND seq>=?", (sid, seq))

    # ---------------------------------------------------------- generation
    def live_metrics(self) -> dict:
        live = self._live
        return {"runtime": self.runtime.status().model_dump(),
                "generation": live.snapshot() if live else None}

    def stop(self, generation_id: str | None = None) -> dict:
        live = self._live
        if not live or not self.runtime.generating:
            return {"stopped": False, "reason": "no generation in progress"}
        if generation_id and generation_id != live.generation_id:
            return {"stopped": False, "reason": "generation_id does not match the running generation"}
        live.cancel.set()
        return {"stopped": True, "generation_id": live.generation_id}

    def prepare(self, req: GenerateRequest) -> tuple[dict, list[dict], dict, LiveState]:
        """Validate and persist the user side synchronously (errors become HTTP errors)."""
        if self.runtime.generating:
            raise ConflictError("A generation is already running", code="BUSY")
        if not self.runtime.available:
            from app.core.errors import EngineUnavailableError
            raise EngineUnavailableError("llama-server is not installed.")
        model = self.s.models.get(req.model_id)
        self.validate(model, req.runtime)
        modes = sum([bool(req.content) and not req.edit_message_id, bool(req.edit_message_id), req.regenerate])
        if modes != 1:
            raise ValidationFailed("Provide exactly one of: content, edit_message_id (+content), regenerate.")
        if req.session_id:
            session = self.get_session(req.session_id)
        else:
            title = (req.content or "New conversation").strip().replace("\n", " ")[:60]
            session = self.create_session(title, req.model_id)
            session["messages"] = []
        sid = session["id"]
        msgs = session["messages"]
        if req.system_prompt and not any(m["role"] == "system" for m in msgs):
            self._add_message(sid, "system", req.system_prompt)
        if req.edit_message_id:
            target = next((m for m in msgs if m["id"] == req.edit_message_id), None)
            if not target or target["role"] != "user":
                raise ValidationFailed("edit_message_id must reference a user message of this conversation")
            if not (req.content or "").strip():
                raise ValidationFailed("Edited content cannot be empty")
            self._truncate_from(sid, target["seq"])
            self._add_message(sid, "user", req.content)
        elif req.regenerate:
            convo = [m for m in msgs if m["role"] != "system"]
            if not convo:
                raise ValidationFailed("Nothing to regenerate")
            if convo[-1]["role"] == "assistant":
                self._truncate_from(sid, convo[-1]["seq"])
            elif convo[-1]["role"] != "user":
                raise ValidationFailed("Nothing to regenerate")
        else:
            if not req.content.strip():
                raise ValidationFailed("Message cannot be empty")
            self._add_message(sid, "user", req.content)
        history = [{"role": m["role"], "content": m["content"]} for m in self._messages(sid)
                   if m["status"] in ("complete", "stopped") and m["content"]]
        assistant = self._add_message(sid, "assistant", "", status="generating")
        self.s.db.update("chat_sessions", sid, {"updated_at": utcnow(), "model_id": req.model_id,
                                                "profile_id": req.profile_id})
        live = LiveState(new_id("gen"), req.model_id)
        live.session_id = sid  # type: ignore[attr-defined]
        return {"id": sid, "title": session["title"]}, history, {"assistant": assistant, "model": model}, live

    def start(self, req: GenerateRequest) -> tuple["queue.Queue", LiveState]:
        session, history, ctx, live = self.prepare(req)
        q: queue.Queue = queue.Queue()
        with self._live_lock:
            self._live = live
        threading.Thread(target=self._run, args=(req, session, history, ctx, live, q), daemon=True).start()
        return q, live

    def _run(self, req: GenerateRequest, session: dict, history: list[dict], ctx: dict, live: LiveState,
             q: "queue.Queue") -> None:
        model, assistant = ctx["model"], ctx["assistant"]
        q.put(("session", {"session_id": session["id"], "title": session["title"],
                           "assistant_message_id": assistant["id"], "generation_id": live.generation_id}))
        content, reasoning = [], []
        sampler: LiveSampler | None = None
        status, error = "complete", None
        final: dict = {}
        load_info: dict | None = None
        try:
            if not self.runtime.is_loaded(model["id"], req.runtime):
                live.status = "loading"
                q.put(("status", {"state": "loading", "model_id": model["id"], "runtime": req.runtime.model_dump()}))
                st = self.runtime.ensure_loaded(model["id"], model["path"], req.runtime)
                load_info = {"load_time_s": st.load_time_s, "placement": st.placement.model_dump()}
                if live.cancel.is_set():
                    raise AetherError("Stopped before generation started", code="CANCELLED")
            st = self.runtime.status()
            q.put(("status", {"state": "generating", "placement": st.placement.model_dump(),
                              "build_info": st.build_info, "load": load_info}))
            live.status = "generating"

            def on_sample(s: HwSample) -> None:
                live.last_hw = s
                snap = live.snapshot()
                live.timeline.append({"t": s.t, "tokens": snap["streamed_tokens"], "tps": snap["live_tokens_per_s"]})
                q.put(("metrics", {**snap, "sample": s.model_dump()}))

            sampler = LiveSampler(lambda: self.runtime.pid, on_sample=on_sample).start()
            live.t_request = time.perf_counter()
            for ev in self.runtime.stream_chat(history, req.generation, live.cancel):
                if ev["type"] in ("token", "reasoning"):
                    if live.t_first is None:
                        live.t_first = ev["t"]
                    live.t_last = ev["t"]
                    live.token_times.append(ev["t"])
                    if ev["type"] == "token":
                        live.tokens += 1
                        content.append(ev["text"])
                    else:
                        live.reasoning_tokens += 1
                        reasoning.append(ev["text"])
                    q.put((ev["type"], {"text": ev["text"]}))
                elif ev["type"] == "final":
                    final = ev
            if live.cancel.is_set() or final.get("finish_reason") == "stopped":
                status = "stopped"
        except AetherError as exc:
            status = "stopped" if exc.code == "CANCELLED" else "error"
            error = {"code": exc.code, "message": exc.message, "details": exc.details}
        except Exception as exc:  # pragma: no cover - defensive
            status, error = "error", {"code": "INTERNAL_ERROR", "message": str(exc)}
        finally:
            hw = sampler.stop() if sampler else None
            live.status = status
            metrics = self._final_metrics(req, model, live, final, hw, load_info)
            text = "".join(content)
            row = self.s.db.update("chat_messages", assistant["id"], {
                "content": text, "reasoning": "".join(reasoning) or None, "status": status,
                "metrics": metrics})
            self.s.db.update("chat_sessions", session["id"], {"updated_at": utcnow()})
            if error:
                q.put(("error", error))
            q.put(("done", {"message": row, "metrics": metrics}))
            q.put(END)
            with self._live_lock:
                if self._live is live:
                    self._live = None

    @staticmethod
    def _final_metrics(req: GenerateRequest, model: dict, live: LiveState, final: dict, hw, load_info) -> dict:
        n = live.tokens + live.reasoning_tokens
        timings = final.get("timings") or {}
        usage = final.get("usage") or {}
        wall_ttft = (live.t_first - live.t_request) * 1000 if live.t_first and live.t_request else None
        wall_tpot = ((live.t_last - live.t_first) / (n - 1) * 1000
                     if n > 1 and live.t_last and live.t_first and live.t_last > live.t_first else None)
        total = (time.perf_counter() - live.t_request) * 1000 if live.t_request else None
        completion = usage.get("completion_tokens") or timings.get("predicted_n")
        energy = hw.gpu_energy_j if hw else None
        return {
            "measured_at": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "generation_id": live.generation_id,
            "model": {"id": model["id"], "name": model["name"], "quantization": model["quantization"],
                      "fingerprint": model.get("fingerprint"), "path": model["path"]},
            "generation_params": req.generation.model_dump(),
            "runtime": req.runtime.model_dump(),
            "profile_id": req.profile_id,
            "finish_reason": final.get("finish_reason"),
            "wall": {  # measured by AETHER around the HTTP stream
                "ttft_ms": round(wall_ttft, 2) if wall_ttft is not None else None,
                "tpot_ms": round(wall_tpot, 3) if wall_tpot is not None else None,
                "tokens_per_s": round(1000 / wall_tpot, 2) if wall_tpot else None,
                "total_ms": round(total, 1) if total is not None else None,
                "streamed_chunks": n,
            },
            "engine": {  # reported by llama.cpp (llama-server `timings`)
                "prompt_tokens": usage.get("prompt_tokens"),
                "prompt_tokens_processed": timings.get("prompt_n"),
                "prompt_tokens_cached": timings.get("cache_n"),
                "prompt_ms": timings.get("prompt_ms"),
                "prompt_tokens_per_s": timings.get("prompt_per_second"),
                "completion_tokens": completion,
                "generation_ms": timings.get("predicted_ms"),
                "tpot_ms": timings.get("predicted_per_token_ms"),
                "tokens_per_s": timings.get("predicted_per_second"),
            },
            "hardware": hw.model_dump() if hw else None,
            "energy_per_token_j": round(energy / completion, 5) if energy and completion else None,
            "load": load_info,
            "timeline": live.timeline[-600:],
            "notes": [
                "wall.* measured by AETHER (includes HTTP/SSE overhead); engine.* reported by llama.cpp.",
                "Energy is GPU-only (NVML board counter), device-level.",
            ],
        }

    def performance_history(self, model_id: str | None = None, limit: int = 100) -> list[dict]:
        with self.s.db.connect() as c:
            rows = c.execute(
                "SELECT m.id, m.session_id, m.created_at, m.status, m.metrics FROM chat_messages m "
                "WHERE m.role='assistant' AND m.metrics IS NOT NULL ORDER BY m.created_at DESC LIMIT ?",
                (limit * 3,)).fetchall()
        out = []
        for r in rows:
            d = self.s.db.decode(r)
            m = d.get("metrics") or {}
            if model_id and (m.get("model") or {}).get("id") != model_id:
                continue
            m.pop("timeline", None)
            out.append({"message_id": d["id"], "session_id": d["session_id"], "created_at": d["created_at"],
                        "status": d["status"], "metrics": m})
            if len(out) >= limit:
                break
        return out
