"""Pure-Python GGUF reader (v2/v3, little-endian).

Reads the header, key/value metadata and tensor descriptors without loading
tensor data. Large arrays (e.g. tokenizer vocabularies) are skipped and only
summarised (length + element type) unless ``max_array_items`` allows them.

Spec: https://github.com/ggml-org/ggml/blob/master/docs/gguf.md
A writer is included for tests and for producing small synthetic fixtures.
"""

from __future__ import annotations

import io
import struct
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, BinaryIO

from app.core.errors import UnsupportedFormatError
from app.optimizations.quantization.types import ggml_type

GGUF_MAGIC = b"GGUF"
DEFAULT_ALIGNMENT = 32

# value types
UINT8, INT8, UINT16, INT16, UINT32, INT32, FLOAT32, BOOL, STRING, ARRAY, UINT64, INT64, FLOAT64 = range(13)
_SCALAR = {
    UINT8: "<B", INT8: "<b", UINT16: "<H", INT16: "<h", UINT32: "<I", INT32: "<i",
    FLOAT32: "<f", BOOL: "<?", UINT64: "<Q", INT64: "<q", FLOAT64: "<d",
}


@dataclass
class ArraySummary:
    """Placeholder for arrays too large to keep in memory."""

    element_type: int
    length: int

    def to_json(self) -> dict:
        return {"__array__": True, "element_type": self.element_type, "length": self.length}


@dataclass
class GGUFTensorInfo:
    name: str
    shape: list[int]  # ggml order: ne[0] (row length) first
    type_id: int
    offset: int  # relative to the data section

    @property
    def n_elements(self) -> int:
        n = 1
        for d in self.shape:
            n *= d
        return n

    @property
    def type_name(self) -> str:
        t = ggml_type(self.type_id)
        return t.name if t else f"UNKNOWN_{self.type_id}"

    @property
    def nbytes(self) -> int | None:
        t = ggml_type(self.type_id)
        if t is None or self.n_elements % t.block_size:
            return None
        return self.n_elements // t.block_size * t.type_size


@dataclass
class GGUFFile:
    path: Path | None
    version: int
    metadata: dict[str, Any]
    tensors: list[GGUFTensorInfo]
    alignment: int
    data_offset: int
    file_size: int
    warnings: list[str] = field(default_factory=list)

    def get(self, key: str, default=None):
        v = self.metadata.get(key, default)
        return default if isinstance(v, ArraySummary) else v

    @property
    def architecture(self) -> str | None:
        return self.get("general.architecture")

    def arch_key(self, suffix: str, default=None):
        arch = self.architecture
        return self.get(f"{arch}.{suffix}", default) if arch else default

    def array_length(self, key: str) -> int | None:
        v = self.metadata.get(key)
        if isinstance(v, ArraySummary):
            return v.length
        if isinstance(v, list):
            return len(v)
        return None


class _Reader:
    def __init__(self, fh: BinaryIO):
        self.fh = fh

    def read(self, n: int) -> bytes:
        b = self.fh.read(n)
        if len(b) != n:
            raise UnsupportedFormatError("Truncated GGUF file", code="CORRUPT_FILE")
        return b

    def scalar(self, vtype: int):
        fmt = _SCALAR[vtype]
        return struct.unpack(fmt, self.read(struct.calcsize(fmt)))[0]

    def u32(self) -> int:
        return struct.unpack("<I", self.read(4))[0]

    def u64(self) -> int:
        return struct.unpack("<Q", self.read(8))[0]

    def string(self) -> str:
        n = self.u64()
        if n > 1 << 30:
            raise UnsupportedFormatError("Implausible GGUF string length", code="CORRUPT_FILE")
        return self.read(n).decode("utf-8", errors="replace")

    def skip_string(self) -> None:
        n = self.u64()
        self.fh.seek(n, io.SEEK_CUR)

    def value(self, vtype: int, max_array_items: int):
        if vtype == STRING:
            return self.string()
        if vtype == ARRAY:
            etype = self.u32()
            n = self.u64()
            if n > max_array_items:
                if etype == STRING:
                    for _ in range(n):
                        self.skip_string()
                elif etype in _SCALAR:
                    self.fh.seek(n * struct.calcsize(_SCALAR[etype]), io.SEEK_CUR)
                else:
                    for _ in range(n):
                        self.value(etype, 0)
                return ArraySummary(etype, n)
            return [self.value(etype, max_array_items) for _ in range(n)]
        if vtype in _SCALAR:
            return self.scalar(vtype)
        raise UnsupportedFormatError(f"Unknown GGUF value type {vtype}", code="CORRUPT_FILE")


def read_gguf(path: str | Path, max_array_items: int = 64) -> GGUFFile:
    path = Path(path)
    size = path.stat().st_size
    with open(path, "rb", buffering=1 << 20) as fh:
        g = _parse(fh, max_array_items)
    g.path, g.file_size = path, size
    end = max((t.offset + (t.nbytes or 0) for t in g.tensors), default=0)
    if g.data_offset + end > size:
        g.warnings.append("Tensor data extends past end of file (truncated or split file?)")
    return g


def _parse(fh: BinaryIO, max_array_items: int) -> GGUFFile:
    r = _Reader(fh)
    if r.read(4) != GGUF_MAGIC:
        raise UnsupportedFormatError("Not a GGUF file (bad magic)")
    version = r.u32()
    if version not in (2, 3):
        raise UnsupportedFormatError(f"Unsupported GGUF version {version}")
    n_tensors, n_kv = r.u64(), r.u64()
    if n_tensors > 1 << 24 or n_kv > 1 << 24:
        raise UnsupportedFormatError("Implausible GGUF header counts", code="CORRUPT_FILE")
    meta: dict[str, Any] = {}
    for _ in range(n_kv):
        key = r.string()
        meta[key] = r.value(r.u32(), max_array_items)
    tensors = []
    for _ in range(n_tensors):
        name = r.string()
        nd = r.u32()
        shape = [r.u64() for _ in range(nd)]
        tensors.append(GGUFTensorInfo(name, shape, r.u32(), r.u64()))
    align = meta.get("general.alignment", DEFAULT_ALIGNMENT)
    if not isinstance(align, int) or align <= 0:
        align = DEFAULT_ALIGNMENT
    pos = fh.tell()
    data_offset = (pos + align - 1) // align * align
    return GGUFFile(None, version, meta, tensors, align, data_offset, 0)


# --------------------------------------------------------------------------- writer

def _pack_string(s: str) -> bytes:
    b = s.encode()
    return struct.pack("<Q", len(b)) + b


def _infer_type(v) -> int:
    if isinstance(v, bool):
        return BOOL
    if isinstance(v, int):
        return INT64 if v < 0 else (UINT32 if v < 2**32 else UINT64)
    if isinstance(v, float):
        return FLOAT32
    if isinstance(v, str):
        return STRING
    if isinstance(v, list):
        return ARRAY
    raise TypeError(type(v))


def _pack_value(v, vtype: int) -> bytes:
    if vtype == STRING:
        return _pack_string(v)
    if vtype == ARRAY:
        et = _infer_type(v[0]) if v else UINT32
        return struct.pack("<IQ", et, len(v)) + b"".join(_pack_value(x, et) for x in v)
    return struct.pack(_SCALAR[vtype], v)


def write_gguf(path: str | Path, metadata: dict[str, Any],
               tensors: list[tuple[str, list[int], int, bytes]], alignment: int = DEFAULT_ALIGNMENT) -> None:
    """Write a GGUF v3 file. ``tensors`` = (name, ggml shape, ggml type id, raw bytes)."""
    out = bytearray(b"GGUF" + struct.pack("<IQQ", 3, len(tensors), len(metadata)))
    for k, v in metadata.items():
        vt = _infer_type(v)
        out += _pack_string(k) + struct.pack("<I", vt) + _pack_value(v, vt)
    offset, blobs = 0, []
    for name, shape, tid, data in tensors:
        out += _pack_string(name) + struct.pack("<I", len(shape))
        out += b"".join(struct.pack("<Q", d) for d in shape)
        out += struct.pack("<IQ", tid, offset)
        pad = (-len(data)) % alignment
        blobs.append(data + b"\0" * pad)
        offset += len(data) + pad
    out += b"\0" * ((-len(out)) % alignment)
    Path(path).write_bytes(bytes(out) + b"".join(blobs))
