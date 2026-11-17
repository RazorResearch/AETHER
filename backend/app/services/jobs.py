"""Background job manager for long-running operations.

* Jobs are persisted in ``optimization_jobs`` (kind distinguishes experiment,
  benchmark and optimization jobs) with status, progress and stage.
* A single worker by default: the reference machine (8 GB VRAM / 16 GB RAM)
  must never run two heavy model workloads at once.
* Jobs left ``queued``/``running`` by a previous process are marked
  ``failed`` with code ``INTERRUPTED`` at startup — never ``completed``.
"""

from __future__ import annotations

import threading
import traceback
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any, Callable

from app.core.errors import AetherError, NotFoundError
from app.database.db import Database, new_id, utcnow
from app.engines.base import CancelToken
from app.services.activity import ActivityLog

STATUSES = ("queued", "running", "completed", "failed", "cancelled")
TERMINAL = {"completed", "failed", "cancelled"}


class JobContext:
    def __init__(self, manager: "JobManager", job_id: str, cancel: CancelToken):
        self.manager, self.job_id, self.cancel = manager, job_id, cancel

    def progress(self, fraction: float, stage: str | None = None) -> None:
        self.manager.db.update("optimization_jobs", self.job_id, {
            "progress": round(max(0.0, min(1.0, fraction)), 4), "stage": stage, "updated_at": utcnow()})

    def check_cancelled(self) -> None:
        if self.cancel.cancelled:
            raise AetherError("Cancelled by user", code="CANCELLED")


JobFn = Callable[[JobContext], dict]
DoneFn = Callable[[dict], None]


class JobManager:
    def __init__(self, db: Database, activity: ActivityLog, max_workers: int = 1):
        self.db, self.activity = db, activity
        self._pool = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="aether-job")
        self._tokens: dict[str, CancelToken] = {}
        self._futures: dict[str, Future] = {}
        self._lock = threading.Lock()

    def recover(self) -> int:
        rows, _ = self.db.list("optimization_jobs", limit=10_000)
        n = 0
        for r in rows:
            if r["status"] in ("queued", "running"):
                self.db.update("optimization_jobs", r["id"], {
                    "status": "failed", "finished_at": utcnow(), "updated_at": utcnow(),
                    "error": {"code": "INTERRUPTED", "message": "Engine restarted while the job was active."}})
                n += 1
        return n

    def submit(self, kind: str, params: dict, fn: JobFn, on_done: DoneFn | None = None,
               category: str = "optimization") -> dict:
        now = utcnow()
        job = self.db.insert("optimization_jobs", {
            "id": new_id("job"), "kind": kind, "status": "queued", "progress": 0.0, "stage": "queued",
            "params": params, "created_at": now, "updated_at": now})
        token = CancelToken()
        with self._lock:
            self._tokens[job["id"]] = token
            self._futures[job["id"]] = self._pool.submit(self._run, job["id"], fn, token, on_done, category, kind)
        return job

    def _run(self, job_id: str, fn: JobFn, token: CancelToken, on_done: DoneFn | None, category: str,
             kind: str) -> None:
        if token.cancelled:
            self._finish(job_id, "cancelled", None, {"code": "CANCELLED", "message": "Cancelled before start"})
        else:
            self.db.update("optimization_jobs", job_id, {"status": "running", "started_at": utcnow(),
                                                         "stage": "starting", "updated_at": utcnow()})
            ctx = JobContext(self, job_id, token)
            try:
                result = fn(ctx)
                self._finish(job_id, "completed", result, None)
                self.activity.log(category, f"{kind}.completed", f"Job {job_id} ({kind}) completed", "success",
                                  {"job_id": job_id})
            except AetherError as exc:
                status = "cancelled" if exc.code == "CANCELLED" or token.cancelled else "failed"
                self._finish(job_id, status, None, {"code": exc.code, "message": exc.message,
                                                    "details": exc.details})
                self.activity.log(category, f"{kind}.{status}", f"Job {job_id} ({kind}) {status}: {exc.message}",
                                  "warning" if status == "cancelled" else "error", {"job_id": job_id})
            except Exception as exc:  # unexpected: keep the traceback for debugging
                self._finish(job_id, "failed", None, {"code": "INTERNAL_ERROR", "message": str(exc),
                                                      "details": {"traceback": traceback.format_exc()[-4000:]}})
                self.activity.log(category, f"{kind}.failed", f"Job {job_id} ({kind}) failed: {exc}", "error",
                                  {"job_id": job_id})
        job = self.get(job_id)
        if on_done:
            try:
                on_done(job)
            except Exception:
                traceback.print_exc()
        with self._lock:
            self._tokens.pop(job_id, None)

    def _finish(self, job_id: str, status: str, result: Any, error: dict | None) -> None:
        fields = {"status": status, "result": result, "error": error, "finished_at": utcnow(),
                  "updated_at": utcnow()}
        if status == "completed":
            fields["progress"] = 1.0
            fields["stage"] = "done"
        self.db.update("optimization_jobs", job_id, fields)

    def get(self, job_id: str) -> dict:
        j = self.db.get("optimization_jobs", job_id)
        if j is None:
            raise NotFoundError(f"Job '{job_id}' not found", details={"job_id": job_id})
        return j

    def list(self, kind: str | None = None, status: str | None = None, limit: int = 100, offset: int = 0):
        return self.db.list("optimization_jobs", {"kind": kind, "status": status}, limit=limit, offset=offset)

    def cancel(self, job_id: str) -> dict:
        job = self.get(job_id)
        if job["status"] in TERMINAL:
            return job
        with self._lock:
            tok = self._tokens.get(job_id)
        if tok:
            tok.cancel()
        return self.get(job_id)

    def wait(self, job_id: str, timeout: float | None = None) -> dict:
        fut = self._futures.get(job_id)
        if fut:
            fut.result(timeout=timeout)
        return self.get(job_id)

    def shutdown(self) -> None:
        with self._lock:
            for t in self._tokens.values():
                t.cancel()
        self._pool.shutdown(wait=True, cancel_futures=True)
