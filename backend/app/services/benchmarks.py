"""Benchmark service: creates benchmark rows and runs them as background jobs."""

from __future__ import annotations

from app.benchmarks.records import BenchmarkSpec, comparability
from app.benchmarks.runner import run_benchmark
from app.core.errors import EngineUnavailableError, NotFoundError
from app.database.db import new_id, utcnow
from app.services.container import Services
from app.services.jobs import JobContext


class BenchmarkService:
    def __init__(self, s: Services):
        self.s = s

    def list(self, model_id: str | None = None, experiment_id: str | None = None, status: str | None = None,
             limit: int = 100, offset: int = 0):
        return self.s.db.list("benchmarks", {"model_id": model_id, "experiment_id": experiment_id,
                                             "status": status}, limit=limit, offset=offset)

    def get(self, bench_id: str) -> dict:
        b = self.s.db.get("benchmarks", bench_id)
        if b is None:
            raise NotFoundError(f"Benchmark '{bench_id}' not found")
        return b

    def check_engine(self, spec: BenchmarkSpec) -> None:
        st = self.s.engine(spec.engine).status()
        if not st.available or not st.capabilities.get("bench"):
            raise EngineUnavailableError(f"Engine '{spec.engine}' cannot run benchmarks: "
                                         f"{st.reason or 'bench capability missing'}", details=st.model_dump())
        if spec.perplexity_dataset and not st.capabilities.get("perplexity"):
            raise EngineUnavailableError(f"Engine '{spec.engine}' cannot measure perplexity.")

    def create(self, spec: BenchmarkSpec) -> dict:
        model = self.s.models.get(spec.model_id)
        if model["status"] != "available":
            raise NotFoundError("Model file is missing on disk", code="FILE_NOT_FOUND",
                                details={"path": model["path"]})
        self.check_engine(spec)
        hw_id, snap = self.s.record_hardware_profile()
        now = utcnow()
        row = self.s.db.insert("benchmarks", {
            "id": new_id("bench"), "model_id": spec.model_id, "experiment_id": spec.experiment_id,
            "hardware_profile_id": hw_id, "engine": spec.engine, "status": "queued",
            "spec": spec.model_dump(mode="json"), "created_at": now, "updated_at": now})
        engine = self.s.engine(spec.engine)

        def work(ctx: JobContext) -> dict:
            self.s.db.update("benchmarks", row["id"], {"status": "running", "updated_at": utcnow()})
            rec = run_benchmark(spec, model, engine, snap, hw_id, ctx.cancel, ctx.progress)
            return {"benchmark_id": row["id"], "record": rec.model_dump(mode="json")}

        def done(job: dict) -> None:
            fields = {"status": job["status"], "updated_at": utcnow()}
            if job["status"] == "completed":
                fields["record"] = job["result"]["record"]
                fields["engine_version"] = job["result"]["record"].get("engine_version")
            self.s.db.update("benchmarks", row["id"], fields)

        job = self.s.jobs.submit("benchmark", {"benchmark_id": row["id"]}, work, done, category="benchmark")
        self.s.activity.log("benchmark", "benchmark.queued", f"Benchmark queued for {model['name']}", "info",
                            {"benchmark_id": row["id"], "job_id": job["id"]})
        return self.s.db.update("benchmarks", row["id"], {"job_id": job["id"]})

    def compare(self, a_id: str, b_id: str) -> dict:
        a, b = self.get(a_id), self.get(b_id)
        if not a.get("record") or not b.get("record"):
            return {"comparable": False, "issues": ["one of the benchmarks has no completed record"]}
        issues = comparability(a["record"], b["record"])
        return {"comparable": not issues, "issues": issues}
