"""Model Manager: local model library (discovery, import, metadata, removal).

* Models are *registered by path*; files are never copied, moved or deleted.
* Nothing is ever downloaded. Import only accepts files already on disk.
* Supported for analysis: GGUF (full), Safetensors (headers + config.json).
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

from app.core.analyzer import ModelAnalysis, analyze_model
from app.core.errors import ConflictError, NotFoundError, UnsupportedFormatError, ValidationFailed
from app.database.db import Database, new_id, utcnow
from app.formats.detect import ModelFormat, detect_format, is_candidate
from app.services.activity import ActivityLog


def quick_fingerprint(path: Path, chunk: int = 1 << 20) -> str:
    """sha256 over (size, first MiB, last MiB). Fast identity check for multi-GB files.

    Not a full-content hash: two files differing only in the middle would collide.
    Use ``full_sha256`` when an exact identity is required (benchmark publication).
    """
    size = path.stat().st_size
    h = hashlib.sha256(str(size).encode())
    with open(path, "rb") as fh:
        h.update(fh.read(chunk))
        if size > chunk:
            fh.seek(max(size - chunk, chunk))
            h.update(fh.read(chunk))
    return "q:" + h.hexdigest()[:32]


def full_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(8 << 20), b""):
            h.update(block)
    return h.hexdigest()


class ModelManager:
    def __init__(self, db: Database, activity: ActivityLog, model_dirs: tuple[Path, ...] = ()):
        self.db = db
        self.activity = activity
        self.model_dirs = model_dirs

    # ------------------------------------------------------------------ queries
    def list(self, format: str | None = None, limit: int = 100, offset: int = 0):
        return self.db.list("models", {"format": format}, order="name ASC", limit=limit, offset=offset)

    def get(self, model_id: str) -> dict:
        m = self.db.get("models", model_id)
        if m is None:
            raise NotFoundError(f"Model '{model_id}' not found", details={"model_id": model_id})
        exists = Path(m["path"]).exists()
        if not exists and m["status"] != "missing":
            m = self.db.update("models", model_id, {"status": "missing", "updated_at": utcnow()})
        elif exists and m["status"] == "missing":
            m = self.db.update("models", model_id, {"status": "available", "updated_at": utcnow()})
        return m

    def analysis(self, model_id: str, include_tensors: bool = False) -> ModelAnalysis:
        m = self.get(model_id)
        if include_tensors or not m.get("analysis"):
            return analyze_model(m["path"], include_tensors=include_tensors)
        return ModelAnalysis.model_validate(m["analysis"])

    # ------------------------------------------------------------------ mutations
    def import_model(self, path: str, name: str | None = None) -> dict:
        p = Path(path).expanduser()
        if not p.is_absolute():
            raise ValidationFailed("Model path must be absolute", details={"path": path})
        if not p.exists() or not p.is_file():
            raise NotFoundError(f"File not found: {p}", code="FILE_NOT_FOUND", details={"path": str(p)})
        p = p.resolve()
        if self.db.find_one("models", path=str(p)):
            raise ConflictError("Model already registered", code="MODEL_ALREADY_EXISTS", details={"path": str(p)})
        fmt = detect_format(p)
        if fmt in (ModelFormat.UNKNOWN, ModelFormat.PYTORCH):
            raise UnsupportedFormatError(
                f"Unsupported model format '{fmt.value}'. Supported: GGUF, Safetensors.",
                details={"path": str(p), "detected_format": fmt.value})
        analysis = analyze_model(p)
        now = utcnow()
        row = self.db.insert("models", {
            "id": new_id("mdl"),
            "name": name or analysis.name or p.stem,
            "path": str(p),
            "format": fmt.value,
            "architecture": analysis.architecture.architecture,
            "n_params": analysis.n_params,
            "file_size_bytes": analysis.file_size_bytes,
            "quantization": analysis.quantization.file_type,
            "context_length": analysis.architecture.context_length,
            "fingerprint": quick_fingerprint(p),
            "status": "available",
            "analysis": analysis.model_dump(mode="json"),
            "created_at": now,
            "updated_at": now,
        })
        self.activity.log("model", "model.imported", f"Imported {row['name']} ({fmt.value})", "success",
                          {"model_id": row["id"], "path": str(p)})
        return row

    def remove(self, model_id: str) -> None:
        m = self.get(model_id)
        self.db.delete("models", model_id)
        self.activity.log("model", "model.removed",
                          f"Removed {m['name']} from the library (file left untouched on disk)", "info",
                          {"model_id": model_id, "path": m["path"]})

    def scan(self, directories: list[Path] | None = None, max_depth: int = 3) -> dict:
        """Register every supported model file found under the given directories."""
        dirs = [Path(d) for d in (directories or self.model_dirs)]
        if not dirs:
            raise ValidationFailed("No directory to scan (set AETHER_MODEL_DIRS or pass directories)")
        imported, skipped, errors = [], [], []
        for root in dirs:
            if not root.is_dir():
                errors.append({"path": str(root), "error": "not a directory"})
                continue
            base_depth = len(root.resolve().parts)
            for dirpath, dirnames, filenames in os.walk(root):
                if len(Path(dirpath).resolve().parts) - base_depth >= max_depth:
                    dirnames.clear()
                for fn in filenames:
                    fp = Path(dirpath) / fn
                    if not is_candidate(fp) or fn.endswith(".bin") or fn.endswith((".pt", ".pth")):
                        continue
                    # skip individual shards when an index exists
                    if fn.endswith(".safetensors") and any(Path(dirpath).glob("*.safetensors.index.json")):
                        continue
                    if self.db.find_one("models", path=str(fp.resolve())):
                        skipped.append(str(fp))
                        continue
                    try:
                        imported.append(self.import_model(str(fp.resolve())))
                    except Exception as exc:  # keep scanning other files
                        errors.append({"path": str(fp), "error": str(exc)})
        return {"imported": imported, "skipped": skipped, "errors": errors}
