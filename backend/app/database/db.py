"""SQLite persistence (stdlib ``sqlite3``) with forward-only versioned migrations.

* Experimental data (models, experiments, benchmarks, jobs, hardware profiles,
  activity) lives in the database. Engine configuration lives in environment
  variables (``app.core.config``) — never in this database.
* Model weights are never stored here, only paths and extracted metadata.
* Each migration runs once, in order, inside a transaction, and is recorded in
  ``schema_migrations``.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

MIGRATIONS: list[tuple[int, str, str]] = [
    (1, "initial schema", """
    CREATE TABLE models (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        format TEXT NOT NULL,
        architecture TEXT,
        n_params INTEGER,
        file_size_bytes INTEGER NOT NULL,
        quantization TEXT,
        context_length INTEGER,
        fingerprint TEXT,
        status TEXT NOT NULL DEFAULT 'available',
        analysis TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE hardware_profiles (
        id TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        snapshot TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE INDEX idx_hw_fingerprint ON hardware_profiles(fingerprint);
    CREATE TABLE experiments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        model_id TEXT REFERENCES models(id) ON DELETE SET NULL,
        hypothesis TEXT,
        status TEXT NOT NULL,
        config TEXT NOT NULL,
        result TEXT,
        job_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE benchmarks (
        id TEXT PRIMARY KEY,
        model_id TEXT REFERENCES models(id) ON DELETE SET NULL,
        experiment_id TEXT REFERENCES experiments(id) ON DELETE SET NULL,
        hardware_profile_id TEXT REFERENCES hardware_profiles(id),
        engine TEXT NOT NULL,
        engine_version TEXT,
        status TEXT NOT NULL,
        spec TEXT NOT NULL,
        record TEXT,
        job_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE optimization_jobs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        progress REAL NOT NULL DEFAULT 0,
        stage TEXT,
        params TEXT NOT NULL,
        result TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE activity_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        category TEXT NOT NULL,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL,
        details TEXT
    );
    CREATE INDEX idx_activity_ts ON activity_logs(timestamp);
    """),
    (2, "chat: sessions, messages, profiles, comparisons", """
    CREATE TABLE chat_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        model_id TEXT REFERENCES models(id) ON DELETE SET NULL,
        profile_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        reasoning TEXT,
        status TEXT NOT NULL,
        metrics TEXT,
        created_at TEXT NOT NULL
    );
    CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, seq);
    CREATE TABLE chat_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        model_id TEXT REFERENCES models(id) ON DELETE SET NULL,
        generation TEXT NOT NULL,
        runtime TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE chat_comparisons (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        request TEXT NOT NULL,
        results TEXT,
        job_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    """),
]

JSON_COLUMNS = {"analysis", "snapshot", "config", "result", "spec", "record", "params", "details", "error",
                "metrics", "generation", "runtime", "request", "results"}


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class Database:
    def __init__(self, path: Path | str):
        self.path = str(path)
        self._lock = threading.RLock()
        self._memory_conn: sqlite3.Connection | None = None
        if self.path == ":memory:":
            self._memory_conn = self._open()

    def _open(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=30, check_same_thread=False, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        if self.path != ":memory:":
            conn.execute("PRAGMA journal_mode=WAL")
        return conn

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            conn = self._memory_conn or self._open()
            try:
                yield conn
            finally:
                if conn is not self._memory_conn:
                    conn.close()

    def migrate(self) -> int:
        with self.connect() as c:
            c.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, "
                      "description TEXT NOT NULL, applied_at TEXT NOT NULL)")
            done = {r[0] for r in c.execute("SELECT version FROM schema_migrations")}
            for version, desc, sql in MIGRATIONS:
                if version in done:
                    continue
                c.execute("BEGIN")
                try:
                    for stmt in filter(str.strip, sql.split(";")):
                        c.execute(stmt)
                    c.execute("INSERT INTO schema_migrations VALUES (?,?,?)", (version, desc, utcnow()))
                    c.execute("COMMIT")
                except Exception:
                    c.execute("ROLLBACK")
                    raise
            return max((v for v, _, _ in MIGRATIONS), default=0)

    def schema_version(self) -> int:
        with self.connect() as c:
            r = c.execute("SELECT MAX(version) FROM schema_migrations").fetchone()
            return r[0] or 0

    # ---------------------------------------------------------------- generic CRUD
    @staticmethod
    def _encode(row: dict[str, Any]) -> dict[str, Any]:
        return {k: (json.dumps(v, default=str) if k in JSON_COLUMNS and v is not None else v)
                for k, v in row.items()}

    @staticmethod
    def decode(row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        d = dict(row)
        for k in JSON_COLUMNS & d.keys():
            if d[k] is not None:
                d[k] = json.loads(d[k])
        return d

    def insert(self, table: str, row: dict[str, Any]) -> dict[str, Any]:
        row = self._encode(row)
        cols = ",".join(row)
        with self.connect() as c:
            c.execute(f"INSERT INTO {table} ({cols}) VALUES ({','.join('?' * len(row))})", tuple(row.values()))
        return self.get(table, row["id"])

    def update(self, table: str, id_: str, fields: dict[str, Any]) -> dict[str, Any] | None:
        if not fields:
            return self.get(table, id_)
        fields = self._encode(fields)
        sets = ",".join(f"{k}=?" for k in fields)
        with self.connect() as c:
            c.execute(f"UPDATE {table} SET {sets} WHERE id=?", (*fields.values(), id_))
        return self.get(table, id_)

    def get(self, table: str, id_: str) -> dict[str, Any] | None:
        with self.connect() as c:
            return self.decode(c.execute(f"SELECT * FROM {table} WHERE id=?", (id_,)).fetchone())

    def find_one(self, table: str, **where) -> dict[str, Any] | None:
        clause = " AND ".join(f"{k}=?" for k in where)
        with self.connect() as c:
            return self.decode(c.execute(f"SELECT * FROM {table} WHERE {clause} LIMIT 1",
                                         tuple(where.values())).fetchone())

    def list(self, table: str, where: dict[str, Any] | None = None, order: str = "created_at DESC",
             limit: int = 100, offset: int = 0) -> tuple[list[dict[str, Any]], int]:
        where = {k: v for k, v in (where or {}).items() if v is not None}
        clause = (" WHERE " + " AND ".join(f"{k}=?" for k in where)) if where else ""
        with self.connect() as c:
            total = c.execute(f"SELECT COUNT(*) FROM {table}{clause}", tuple(where.values())).fetchone()[0]
            rows = c.execute(f"SELECT * FROM {table}{clause} ORDER BY {order} LIMIT ? OFFSET ?",
                             (*where.values(), limit, offset)).fetchall()
        return [self.decode(r) for r in rows], total

    def delete(self, table: str, id_: str) -> bool:
        with self.connect() as c:
            return c.execute(f"DELETE FROM {table} WHERE id=?", (id_,)).rowcount > 0
