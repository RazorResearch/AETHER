"""Test helpers: synthetic GGUF models, fake llama.cpp tools and fake hardware."""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from app.core.hardware import CPUInfo, GPUInfo, HardwareSnapshot, MemoryInfo, SoftwareInfo
from app.formats.gguf import write_gguf

FAKE_DIR = Path(__file__).parent / "fake_llamacpp"
GiB = 1024**3


def make_llama_gguf(path: Path, n_layers: int = 2, embd: int = 256, ff: int = 512, heads: int = 4,
                    kv_heads: int = 2, vocab: int = 300, ctx: int = 8192, dtype: str = "F16",
                    seed: int = 0, file_type: int | None = 1) -> Path:
    """Tiny llama-architecture GGUF with random weights (F16, BF16 or F32)."""
    rng = np.random.default_rng(seed)
    head_dim = embd // heads

    def tensor(name, shape, scale=0.02):
        n = int(np.prod(shape))
        w = (rng.standard_normal(n) * scale).astype(np.float32)
        if "norm" in name:
            return (name, list(shape), 0, np.ones(n, np.float32).tobytes())
        if dtype == "F32":
            return (name, list(shape), 0, w.tobytes())
        if dtype == "BF16":
            return (name, list(shape), 30, (w.view(np.uint32) >> 16).astype(np.uint16).tobytes())
        return (name, list(shape), 1, w.astype(np.float16).tobytes())

    tensors = [tensor("token_embd.weight", (embd, vocab))]
    for i in range(n_layers):
        p = f"blk.{i}."
        tensors += [
            tensor(p + "attn_norm.weight", (embd,)),
            tensor(p + "attn_q.weight", (embd, embd)),
            tensor(p + "attn_k.weight", (embd, kv_heads * head_dim)),
            tensor(p + "attn_v.weight", (embd, kv_heads * head_dim)),
            # larger scale on layer 0 (changes absolute, not relative, error)
            tensor(p + "attn_output.weight", (embd, embd), scale=0.02 if i else 0.05),
            tensor(p + "ffn_norm.weight", (embd,)),
            tensor(p + "ffn_gate.weight", (embd, ff)),
            tensor(p + "ffn_up.weight", (embd, ff)),
            tensor(p + "ffn_down.weight", (ff, embd)),
        ]
    tensors += [tensor("output_norm.weight", (embd,)), tensor("output.weight", (embd, vocab))]
    meta = {
        "general.architecture": "llama",
        "general.name": "aether-test-tiny",
        "general.size_label": "tiny",
        "llama.block_count": n_layers,
        "llama.context_length": ctx,
        "llama.embedding_length": embd,
        "llama.feed_forward_length": ff,
        "llama.attention.head_count": heads,
        "llama.attention.head_count_kv": kv_heads,
        "llama.rope.freq_base": 10000.0,
        "tokenizer.ggml.model": "llama",
        "tokenizer.ggml.tokens": [f"t{i}" for i in range(vocab)],
    }
    if file_type is not None:
        meta["general.file_type"] = file_type
    write_gguf(path, meta, tensors)
    return path


def fake_binaries(tools=("llama-bench", "llama-perplexity", "llama-quantize", "llama-imatrix")) -> dict:
    return {t: [sys.executable, str(FAKE_DIR / f"{t.replace('-', '_')}.py")] for t in tools}


def fake_hardware(gpu: bool = False, vram_free: int = 6 * GiB, ram_avail: int = 10 * GiB) -> HardwareSnapshot:
    gpus = [GPUInfo(index=0, name="Test GPU", vram_total_bytes=8 * GiB, vram_free_bytes=vram_free,
                    vram_used_bytes=8 * GiB - vram_free)] if gpu else []
    return HardwareSnapshot(
        captured_at=datetime.now(timezone.utc), gpus=gpus,
        cpu=CPUInfo(model="Test CPU", logical_cores=8, physical_cores=4),
        memory=MemoryInfo(total_bytes=16 * GiB, available_bytes=ram_avail, used_bytes=16 * GiB - ram_avail,
                          percent=50.0, swap_total_bytes=0, swap_used_bytes=0),
        disks=[], software=SoftwareInfo(os="TestOS", os_release="1", python="3"),
        cuda_available=gpu, accelerator="cuda" if gpu else "cpu", warnings=[])
