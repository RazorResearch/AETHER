"""PyTorch engine (optional).

Planned use: research operations that need tensor-level access (calibration,
activation statistics, Safetensors models). PyTorch is *not* a hard dependency;
when absent every operation raises ``EngineUnavailableError``. Inference
benchmarking through PyTorch is not implemented yet and says so explicitly.
"""

from __future__ import annotations

import importlib.util

from app.core.errors import EngineUnavailableError, FeatureNotImplemented
from app.engines.base import (BenchParams, BenchResult, CancelToken, EngineStatus, InferenceEngine,
                              PerplexityResult, ProgressFn, RuntimeParams)


class PyTorchEngine(InferenceEngine):
    name = "pytorch"

    def status(self) -> EngineStatus:
        if importlib.util.find_spec("torch") is None:
            return EngineStatus(name=self.name, available=False,
                                reason="PyTorch is not installed (optional dependency: pip install torch).")
        import torch

        return EngineStatus(name=self.name, available=True, version=torch.__version__,
                            capabilities={"bench": False, "perplexity": False, "tensor_access": True},
                            details={"cuda": torch.cuda.is_available(), "cuda_runtime": torch.version.cuda})

    def _require(self) -> None:
        if not self.status().available:
            raise EngineUnavailableError("PyTorch engine unavailable: PyTorch is not installed.")

    def bench(self, model_path: str, params: BenchParams, cancel: CancelToken | None = None,
              progress: ProgressFn | None = None) -> BenchResult:
        self._require()
        raise FeatureNotImplemented("PyTorch benchmarking is not implemented yet; use the llama.cpp engine.")

    def perplexity(self, model_path: str, dataset_path: str, runtime: RuntimeParams, n_ctx: int = 512,
                   n_chunks: int | None = None, cancel: CancelToken | None = None) -> PerplexityResult:
        self._require()
        raise FeatureNotImplemented("PyTorch perplexity is not implemented yet; use the llama.cpp engine.")
