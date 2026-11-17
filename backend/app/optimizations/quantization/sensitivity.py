"""Per-tensor quantization sensitivity (research prototype).

``WeightSpaceProxy`` measures, for each tensor and each candidate bit-width,
the relative reconstruction error of a *simulated* blockwise symmetric
round-to-nearest quantizer:

    err(W, b) = ||W - Q_b(W)||_F^2 / ||W||_F^2

LIMITS (see docs/OPTIMIZATION_METHODS.md):
* weight-space only — ignores activations and the downstream effect of a
  tensor on the loss (no calibration data). It is a *proxy*, not a quality
  measure; output-space validation (perplexity) is required.
* the simulated quantizer is not llama.cpp's K-quant (which uses super-blocks,
  sub-block scales/mins and, with an importance matrix, weighted rounding).
* requires unquantized tensors (F32 / F16 / BF16 source GGUF).

The ``SensitivityProvider`` interface is the hook for stronger methods:
imatrix-weighted error, Hessian/Fisher traces, measured per-layer perplexity.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Callable

import numpy as np
from pydantic import BaseModel

from app.formats.gguf import GGUFFile, GGUFTensorInfo, read_gguf

FLOAT_TYPES = {0: np.float32, 1: np.float16}  # 30 = BF16 handled separately
BF16 = 30


class TensorSensitivity(BaseModel):
    name: str
    shape: list[int]
    n_params: int
    source_type: str
    errors: dict[int, float]  # bits -> relative error


class SensitivityProvider(ABC):
    method: str

    @abstractmethod
    def measure(self, path: Path, bits: list[int], tensor_filter: Callable[[str], bool] | None = None,
                progress: Callable[[float, str], None] | None = None) -> list[TensorSensitivity]: ...


def load_tensor(g: GGUFFile, t: GGUFTensorInfo) -> np.ndarray:
    """Memory-map an unquantized tensor as float32 array of shape (rows, ne0)."""
    if t.type_id not in FLOAT_TYPES and t.type_id != BF16:
        raise ValueError(f"tensor {t.name} is {t.type_name}; only F32/F16/BF16 can be analysed")
    offset = g.data_offset + t.offset
    count = t.n_elements
    if t.type_id == BF16:
        raw = np.memmap(g.path, dtype=np.uint16, mode="r", offset=offset, shape=(count,))
        arr = (raw.astype(np.uint32) << 16).view(np.float32)
    else:
        arr = np.memmap(g.path, dtype=FLOAT_TYPES[t.type_id], mode="r", offset=offset, shape=(count,))
        arr = np.asarray(arr, dtype=np.float32)
    return arr.reshape(-1, t.shape[0])


def simulated_quant_error(w: np.ndarray, bits: int, block: int = 32) -> float:
    """Relative squared error of blockwise symmetric absmax RTN quantization."""
    flat = w.reshape(-1)
    n = flat.size - flat.size % block
    if n == 0:
        return 0.0
    x = flat[:n].reshape(-1, block).astype(np.float32)
    qmax = 2 ** (bits - 1) - 1
    if qmax < 1:
        qmax = 1
    scale = np.abs(x).max(axis=1, keepdims=True) / qmax
    scale[scale == 0] = 1.0
    q = np.clip(np.rint(x / scale), -qmax, qmax) * scale
    num = float(np.square(x - q, dtype=np.float64).sum())
    den = float(np.square(x, dtype=np.float64).sum())
    return num / den if den > 0 else 0.0


def default_tensor_filter(name: str) -> bool:
    """Quantizable 2-D weight matrices (llama.cpp keeps norms/biases in F32)."""
    return name.endswith(".weight") and "norm" not in name


class WeightSpaceProxy(SensitivityProvider):
    method = "weight_space_rtn_proxy"

    def __init__(self, max_rows: int | None = 4096, seed: int = 0):
        # Row subsampling bounds memory/time on large tensors; deterministic seed.
        self.max_rows = max_rows
        self.seed = seed

    def measure(self, path: Path, bits: list[int], tensor_filter=None, progress=None) -> list[TensorSensitivity]:
        g = read_gguf(path)
        filt = tensor_filter or default_tensor_filter
        tensors = [t for t in g.tensors if filt(t.name) and len(t.shape) >= 2]
        unsupported = [t.name for t in tensors if t.type_id not in FLOAT_TYPES and t.type_id != BF16]
        if unsupported:
            raise ValueError(f"{len(unsupported)} tensors are already quantized (e.g. {unsupported[0]}); "
                             "provide an F16/BF16/F32 GGUF as source")
        rng = np.random.default_rng(self.seed)
        out = []
        for i, t in enumerate(tensors):
            w = load_tensor(g, t)
            if self.max_rows and w.shape[0] > self.max_rows:
                idx = np.sort(rng.choice(w.shape[0], self.max_rows, replace=False))
                w = np.asarray(w[idx])
            out.append(TensorSensitivity(name=t.name, shape=t.shape, n_params=t.n_elements,
                                         source_type=t.type_name,
                                         errors={b: simulated_quant_error(w, b) for b in bits}))
            if progress:
                progress((i + 1) / len(tensors), t.name)
        return out
