import threading

from app.core.errors import ValidationFailed
from app.database.db import Database, utcnow
from app.services.activity import ActivityLog
from app.services.jobs import JobManager


def test_migrations_idempotent(tmp_path):
    db = Database(tmp_path / "a.db")
    assert db.migrate() == 1
    assert db.migrate() == 1
    assert db.schema_version() == 1


def test_crud_and_json_columns(tmp_path):
    db = Database(tmp_path / "a.db")
    db.migrate()
    now = utcnow()
    db.insert("optimization_jobs", {"id": "job_1", "kind": "k", "status": "queued", "params": {"a": [1, 2]},
                                    "created_at": now, "updated_at": now})
    assert db.get("optimization_jobs", "job_1")["params"] == {"a": [1, 2]}
    db.update("optimization_jobs", "job_1", {"result": {"ok": True}})
    rows, total = db.list("optimization_jobs", {"kind": "k"})
    assert total == 1 and rows[0]["result"] == {"ok": True}
    assert db.delete("optimization_jobs", "job_1") and db.get("optimization_jobs", "job_1") is None


def _jm(tmp_path):
    db = Database(tmp_path / "a.db")
    db.migrate()
    return JobManager(db, ActivityLog(db)), db


def test_job_success_failure_cancel(tmp_path):
    jm, db = _jm(tmp_path)
    ok = jm.submit("t", {}, lambda ctx: (ctx.progress(0.5, "half"), {"value": 42})[1])
    assert jm.wait(ok["id"], 10)["status"] == "completed"
    assert jm.get(ok["id"])["result"] == {"value": 42} and jm.get(ok["id"])["progress"] == 1.0

    def bad(ctx):
        raise ValidationFailed("nope")

    j = jm.wait(jm.submit("t", {}, bad)["id"], 10)
    assert j["status"] == "failed" and j["error"]["code"] == "VALIDATION_ERROR" and j["result"] is None

    started = threading.Event()

    def slow(ctx):
        started.set()
        while True:
            ctx.check_cancelled()

    s = jm.submit("t", {}, slow)
    started.wait(5)
    jm.cancel(s["id"])
    assert jm.wait(s["id"], 10)["status"] == "cancelled"
    jm.shutdown()


def test_recover_marks_interrupted_jobs_failed(tmp_path):
    jm, db = _jm(tmp_path)
    now = utcnow()
    db.insert("optimization_jobs", {"id": "job_x", "kind": "k", "status": "running", "params": {},
                                    "created_at": now, "updated_at": now})
    assert jm.recover() == 1
    j = db.get("optimization_jobs", "job_x")
    assert j["status"] == "failed" and j["error"]["code"] == "INTERRUPTED"
    jm.shutdown()
