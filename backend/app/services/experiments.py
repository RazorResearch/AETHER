"""Experiment service (create / list / start)."""

from __future__ import annotations

from app.core.errors import ConfirmationRequired, ConflictError, NotFoundError
from app.database.db import new_id, utcnow
from app.experiments.registry import TYPES, validate_config
from app.services.container import Services
from app.services.jobs import JobContext


class ExperimentService:
    def __init__(self, s: Services):
        self.s = s

    def types(self) -> list[dict]:
        return [t[0].model_dump() for t in TYPES.values()]

    def _with_job(self, e: dict) -> dict:
        if e.get("job_id"):
            job = self.s.db.get("optimization_jobs", e["job_id"])
            if job:
                e["job"] = {k: job[k] for k in ("id", "status", "progress", "stage", "error")}
                # the job row is final a few ms before the experiment row is updated
                if job["status"] in ("completed", "failed", "cancelled") and e["status"] in ("queued", "running"):
                    e["status"] = job["status"]
        return e

    def list(self, status: str | None = None, type_: str | None = None, limit: int = 100, offset: int = 0):
        items, total = self.s.db.list("experiments", {"status": status, "type": type_}, limit=limit, offset=offset)
        return [self._with_job(e) for e in items], total

    def get(self, exp_id: str) -> dict:
        e = self.s.db.get("experiments", exp_id)
        if e is None:
            raise NotFoundError(f"Experiment '{exp_id}' not found", details={"experiment_id": exp_id})
        return self._with_job(e)

    def create(self, name: str, type_: str, config: dict, hypothesis: str | None = None) -> dict:
        cfg = validate_config(type_, config)
        model_id = getattr(cfg, "model_id", None)
        if model_id:
            self.s.models.get(model_id)  # 404 if unknown
        now = utcnow()
        row = self.s.db.insert("experiments", {
            "id": new_id("exp"), "name": name, "type": type_, "model_id": model_id, "hypothesis": hypothesis,
            "status": "draft", "config": cfg.model_dump(mode="json"), "created_at": now, "updated_at": now})
        self.s.activity.log("experiment", "experiment.created", f"Experiment '{name}' created ({type_})", "info",
                            {"experiment_id": row["id"]})
        return row

    def delete(self, exp_id: str) -> None:
        exp = self.get(exp_id)
        if exp["status"] in ("queued", "running"):
            raise ConflictError("Cancel the running job before deleting the experiment", code="ALREADY_RUNNING")
        with self.s.db.connect() as c:
            c.execute("UPDATE benchmarks SET experiment_id=NULL WHERE experiment_id=?", (exp_id,))
        self.s.db.delete("experiments", exp_id)
        self.s.activity.log("experiment", "experiment.deleted", f"Experiment '{exp['name']}' deleted", "info",
                            {"experiment_id": exp_id})

    def start(self, exp_id: str, confirm: bool = False) -> dict:
        exp = self.get(exp_id)
        if exp["status"] in ("queued", "running"):
            raise ConflictError("Experiment is already running", code="ALREADY_RUNNING")
        etype, cfg_cls, runner = TYPES[exp["type"]]
        if etype.cost == "expensive" and not confirm:
            raise ConfirmationRequired(
                f"Experiment type '{etype.id}' is expensive (GPU/disk intensive). Re-send with confirm=true.",
                details={"cost": etype.cost, "requires": etype.requires})
        cfg = cfg_cls.model_validate(exp["config"])

        def work(ctx: JobContext) -> dict:
            self.s.db.update("experiments", exp_id, {"status": "running", "updated_at": utcnow()})
            return runner(self.s, exp, cfg, ctx)

        def done(job: dict) -> None:
            self.s.db.update("experiments", exp_id, {"status": job["status"], "result": job.get("result"),
                                                     "updated_at": utcnow()})

        # status must be written *before* submission: a fast job may finish immediately
        self.s.db.update("experiments", exp_id, {"status": "queued", "result": None, "updated_at": utcnow()})
        job = self.s.jobs.submit(f"experiment:{exp['type']}", {"experiment_id": exp_id}, work, done,
                                 category="experiment")
        self.s.db.update("experiments", exp_id, {"job_id": job["id"]})
        self.s.activity.log("experiment", "experiment.started", f"Experiment '{exp['name']}' started", "info",
                            {"experiment_id": exp_id, "job_id": job["id"]})
        return self.get(exp_id)
