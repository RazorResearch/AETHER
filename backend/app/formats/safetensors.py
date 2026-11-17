"""Minimal Safetensors header reader (no tensor data is loaded).

Format: 8-byte little-endian header length N, then N bytes of JSON.
Sharded checkpoints (``*.safetensors.index.json``) are aggregated, and a
sibling Hugging Face ``config.json`` is read when present for architecture
information. This is the extension point for non-GGUF models.
"""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.core.errors import UnsupportedFormatError

DTYPE_BYTES = {"F64": 8, "F32": 4, "F16": 2, "BF16": 2, "I64": 8, "I32": 4, "I16": 2, "I8": 1,
               "U8": 1, "BOOL": 1, "F8_E4M3": 1, "F8_E5M2": 1}


@dataclass
class SafetensorsTensor:
    name: str
    dtype: str
    shape: list[int]
    nbytes: int

    @property
    def n_elements(self) -> int:
        n = 1
        for d in self.shape:
            n *= d
        return n


@dataclass
class SafetensorsFile:
    paths: list[Path]
    metadata: dict[str, str]
    tensors: list[SafetensorsTensor]
    hf_config: dict[str, Any] | None
    file_size: int
    warnings: list[str] = field(default_factory=list)


def _read_header(path: Path) -> dict:
    with open(path, "rb") as fh:
        raw = fh.read(8)
        if len(raw) != 8:
            raise UnsupportedFormatError("Truncated safetensors file", code="CORRUPT_FILE")
        (n,) = struct.unpack("<Q", raw)
        if n > 100 * 1024**2:
            raise UnsupportedFormatError("Implausible safetensors header size", code="CORRUPT_FILE")
        try:
            return json.loads(fh.read(n))
        except json.JSONDecodeError as exc:
            raise UnsupportedFormatError(f"Invalid safetensors header: {exc}", code="CORRUPT_FILE")


def read_safetensors(path: str | Path) -> SafetensorsFile:
    path = Path(path)
    if path.name.endswith(".index.json"):
        index = json.loads(path.read_text())
        shard_names = sorted(set(index.get("weight_map", {}).values()))
        shards = [path.parent / s for s in shard_names]
    else:
        shards = [path]
    meta: dict[str, str] = {}
    tensors: list[SafetensorsTensor] = []
    warnings: list[str] = []
    size = 0
    for shard in shards:
        if not shard.exists():
            warnings.append(f"missing shard {shard.name}")
            continue
        size += shard.stat().st_size
        header = _read_header(shard)
        meta.update(header.pop("__metadata__", {}) or {})
        for name, t in header.items():
            start, end = t["data_offsets"]
            tensors.append(SafetensorsTensor(name, t["dtype"], list(t["shape"]), end - start))
    cfg_path = path.parent / "config.json"
    cfg = None
    if cfg_path.exists():
        try:
            cfg = json.loads(cfg_path.read_text())
        except Exception as exc:
            warnings.append(f"config.json unreadable: {exc}")
    return SafetensorsFile(shards, meta, tensors, cfg, size, warnings)
