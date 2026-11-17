"""Model format detection by content (magic bytes), not only by extension."""

from __future__ import annotations

import struct
from enum import Enum
from pathlib import Path


class ModelFormat(str, Enum):
    GGUF = "gguf"
    SAFETENSORS = "safetensors"
    PYTORCH = "pytorch"  # .bin / .pt (pickle) - recognised, never unpickled
    UNKNOWN = "unknown"


MODEL_EXTENSIONS = {".gguf", ".safetensors", ".bin", ".pt", ".pth"}


def detect_format(path: str | Path) -> ModelFormat:
    path = Path(path)
    if path.name.endswith(".safetensors.index.json"):
        return ModelFormat.SAFETENSORS
    try:
        with open(path, "rb") as fh:
            head = fh.read(16)
    except OSError:
        return ModelFormat.UNKNOWN
    if head[:4] == b"GGUF":
        return ModelFormat.GGUF
    if len(head) >= 9:
        (n,) = struct.unpack("<Q", head[:8])
        if 2 <= n < 100 * 1024**2 and head[8:9] == b"{":
            return ModelFormat.SAFETENSORS
    if head[:2] == b"PK" or head[:1] == b"\x80":  # zip (torch.save) or raw pickle
        if path.suffix in {".bin", ".pt", ".pth"}:
            return ModelFormat.PYTORCH
    return ModelFormat.UNKNOWN


def is_candidate(path: Path) -> bool:
    if path.name.endswith(".safetensors.index.json"):
        return True
    return path.suffix.lower() in MODEL_EXTENSIONS
