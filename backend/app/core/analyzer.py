"""Model Analyzer.

Produces a ``ModelAnalysis`` from a model file. Every field is either extracted
from the file or ``None``; derived values are marked as such in ``provenance``.

Extensibility: ``ModelInspector`` is the abstract interface; GGUF and
Safetensors inspectors are registered in ``INSPECTORS``.
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from collections import Counter, defaultdict
from pathlib import Path

from pydantic import BaseModel, Field

from app.core.errors import UnsupportedFormatError
from app.formats.detect import ModelFormat, detect_format
from app.formats.gguf import GGUFFile, read_gguf
from app.formats.safetensors import DTYPE_BYTES, read_safetensors
from app.optimizations.quantization.types import LLAMA_FILE_TYPES

_BLK = re.compile(r"^blk\.(\d+)\.")

# Architectures whose KV cache does not follow the dense "n_layer x n_kv_head x
# head_dim" formula (sliding window, MLA, recurrent/hybrid...). Estimates for
# these are flagged as approximate upper bounds.
KV_NON_STANDARD_ARCHS = {
    "deepseek2", "gemma2", "gemma3", "gemma3n", "mamba", "mamba2", "rwkv6", "rwkv7",
    "jamba", "qwen3next", "falcon-h1", "granitehybrid", "lfm2", "plamo2", "cohere2", "gpt-oss",
}


class TensorGroup(BaseModel):
    name: str
    n_tensors: int
    n_params: int
    nbytes: int | None
    types: dict[str, int] = Field(description="tensor type -> number of tensors")


class LayerInfo(BaseModel):
    index: int
    n_params: int
    nbytes: int | None
    types: dict[str, int]
    tensors: list[dict] = Field(default_factory=list, description="name, shape, type, n_params, nbytes")


class ArchitectureInfo(BaseModel):
    architecture: str | None = None
    n_layers: int | None = None
    embedding_length: int | None = None
    feed_forward_length: int | None = None
    n_heads: int | None = None
    n_kv_heads: int | list[int] | None = None
    key_length: int | None = None
    value_length: int | None = None
    context_length: int | None = None
    vocab_size: int | None = None
    rope_freq_base: float | None = None
    expert_count: int | None = None
    expert_used_count: int | None = None
    sliding_window: int | None = None


class QuantizationInfo(BaseModel):
    file_type: str | None = Field(None, description="Preset name from general.file_type, if present.")
    quantization_version: int | None = None
    tensor_type_counts: dict[str, int] = {}
    tensor_type_bytes: dict[str, int] = {}
    bits_per_weight: float | None = Field(None, description="Exact: total tensor bits / total params.")


class ModelAnalysis(BaseModel):
    format: ModelFormat
    path: str
    file_size_bytes: int
    name: str | None = None
    size_label: str | None = None
    n_params: int | None = None
    n_tensors: int
    tensor_data_bytes: int | None = None
    architecture: ArchitectureInfo
    quantization: QuantizationInfo
    layers: list[LayerInfo] = []
    non_layer_tensors: list[TensorGroup] = []
    metadata: dict = Field(default_factory=dict, description="Raw metadata (large arrays summarised).")
    provenance: dict[str, str] = Field(default_factory=dict,
                                       description="field -> 'extracted' | 'derived' | 'unavailable'")
    warnings: list[str] = []


class ModelInspector(ABC):
    format: ModelFormat

    @abstractmethod
    def analyze(self, path: Path, include_tensors: bool = False) -> ModelAnalysis: ...


def _jsonable(v):
    from app.formats.gguf import ArraySummary

    if isinstance(v, ArraySummary):
        return v.to_json()
    if isinstance(v, list):
        return [_jsonable(x) for x in v]
    return v


class GGUFInspector(ModelInspector):
    format = ModelFormat.GGUF

    def analyze(self, path: Path, include_tensors: bool = False) -> ModelAnalysis:
        g = read_gguf(path)
        return analyze_gguf(g, include_tensors)


def analyze_gguf(g: GGUFFile, include_tensors: bool = False) -> ModelAnalysis:
    prov: dict[str, str] = {}
    warnings = list(g.warnings)

    def ext(field_name: str, value):
        prov[field_name] = "extracted" if value is not None else "unavailable"
        return value

    arch = ArchitectureInfo(
        architecture=ext("architecture", g.architecture),
        n_layers=ext("n_layers", g.arch_key("block_count")),
        embedding_length=ext("embedding_length", g.arch_key("embedding_length")),
        feed_forward_length=ext("feed_forward_length", g.arch_key("feed_forward_length")),
        n_heads=ext("n_heads", g.arch_key("attention.head_count")),
        n_kv_heads=ext("n_kv_heads", g.arch_key("attention.head_count_kv")),
        key_length=ext("key_length", g.arch_key("attention.key_length")),
        value_length=ext("value_length", g.arch_key("attention.value_length")),
        context_length=ext("context_length", g.arch_key("context_length")),
        rope_freq_base=ext("rope_freq_base", g.arch_key("rope.freq_base")),
        expert_count=ext("expert_count", g.arch_key("expert_count")),
        expert_used_count=ext("expert_used_count", g.arch_key("expert_used_count")),
        sliding_window=ext("sliding_window", g.arch_key("attention.sliding_window")),
    )
    vocab = g.arch_key("vocab_size") or g.array_length("tokenizer.ggml.tokens")
    arch.vocab_size = ext("vocab_size", vocab)
    if arch.key_length is None and arch.embedding_length and arch.n_heads:
        arch.key_length = arch.embedding_length // arch.n_heads
        prov["key_length"] = "derived"
    if arch.value_length is None and arch.key_length is not None:
        arch.value_length = arch.key_length
        prov["value_length"] = "derived"
    if arch.n_kv_heads is None and arch.n_heads is not None:
        arch.n_kv_heads = arch.n_heads
        prov["n_kv_heads"] = "derived (assumed = n_heads)"
        warnings.append("head_count_kv missing; assumed equal to head_count")
    if arch.architecture in KV_NON_STANDARD_ARCHS:
        warnings.append(f"Architecture '{arch.architecture}' uses a non-standard KV cache layout; "
                        "KV estimates are approximate upper bounds.")

    layers: dict[int, dict] = defaultdict(lambda: {"n_params": 0, "nbytes": 0, "types": Counter(), "tensors": []})
    other: dict[str, dict] = defaultdict(lambda: {"n_params": 0, "nbytes": 0, "types": Counter(), "n": 0})
    type_counts: Counter = Counter()
    type_bytes: Counter = Counter()
    unknown_size = False
    for t in g.tensors:
        nb = t.nbytes
        if nb is None:
            unknown_size = True
        type_counts[t.type_name] += 1
        type_bytes[t.type_name] += nb or 0
        m = _BLK.match(t.name)
        if m:
            L = layers[int(m.group(1))]
            L["n_params"] += t.n_elements
            L["nbytes"] += nb or 0
            L["types"][t.type_name] += 1
            if include_tensors:
                L["tensors"].append({"name": t.name, "shape": t.shape, "type": t.type_name,
                                     "n_params": t.n_elements, "nbytes": nb})
        else:
            key = t.name.rsplit(".", 1)[0]
            o = other[key]
            o["n_params"] += t.n_elements
            o["nbytes"] += nb or 0
            o["types"][t.type_name] += 1
            o["n"] += 1
    if unknown_size:
        warnings.append("Some tensor types are unknown to AETHER; byte totals are partial.")

    n_params = sum(t.n_elements for t in g.tensors)
    total_bytes = None if unknown_size else sum(t.nbytes for t in g.tensors)
    ft = g.get("general.file_type")
    quant = QuantizationInfo(
        file_type=LLAMA_FILE_TYPES.get(ft, f"UNKNOWN_{ft}") if ft is not None else None,
        quantization_version=g.get("general.quantization_version"),
        tensor_type_counts=dict(type_counts),
        tensor_type_bytes=dict(type_bytes),
        bits_per_weight=(total_bytes * 8 / n_params) if total_bytes and n_params else None,
    )
    prov["n_params"] = "derived (sum of tensor elements)"
    prov["bits_per_weight"] = "derived (tensor bytes / params)"
    if arch.n_layers is not None and layers and len(layers) != arch.n_layers:
        warnings.append(f"block_count={arch.n_layers} but {len(layers)} blk.* groups found")

    meta = {k: _jsonable(v) for k, v in g.metadata.items()}
    return ModelAnalysis(
        format=ModelFormat.GGUF,
        path=str(g.path) if g.path else "",
        file_size_bytes=g.file_size,
        name=g.get("general.name"),
        size_label=g.get("general.size_label"),
        n_params=n_params,
        n_tensors=len(g.tensors),
        tensor_data_bytes=total_bytes,
        architecture=arch,
        quantization=quant,
        layers=[LayerInfo(index=i, n_params=v["n_params"], nbytes=v["nbytes"] if not unknown_size else None,
                          types=dict(v["types"]), tensors=v["tensors"]) for i, v in sorted(layers.items())],
        non_layer_tensors=[TensorGroup(name=k, n_tensors=v["n"], n_params=v["n_params"],
                                       nbytes=v["nbytes"] if not unknown_size else None, types=dict(v["types"]))
                           for k, v in sorted(other.items())],
        metadata=meta,
        provenance=prov,
        warnings=warnings,
    )


class SafetensorsInspector(ModelInspector):
    format = ModelFormat.SAFETENSORS

    def analyze(self, path: Path, include_tensors: bool = False) -> ModelAnalysis:
        st = read_safetensors(path)
        cfg = st.hf_config or {}
        prov: dict[str, str] = {}

        def c(field_name, *keys):
            for k in keys:
                if k in cfg:
                    prov[field_name] = "extracted (config.json)"
                    return cfg[k]
            prov[field_name] = "unavailable"
            return None

        arch = ArchitectureInfo(
            architecture=(cfg.get("architectures") or [cfg.get("model_type")])[0] if cfg else None,
            n_layers=c("n_layers", "num_hidden_layers", "n_layer"),
            embedding_length=c("embedding_length", "hidden_size", "n_embd"),
            feed_forward_length=c("feed_forward_length", "intermediate_size"),
            n_heads=c("n_heads", "num_attention_heads", "n_head"),
            n_kv_heads=c("n_kv_heads", "num_key_value_heads"),
            key_length=c("key_length", "head_dim"),
            context_length=c("context_length", "max_position_embeddings", "n_positions"),
            vocab_size=c("vocab_size", "vocab_size"),
            rope_freq_base=c("rope_freq_base", "rope_theta"),
            sliding_window=c("sliding_window", "sliding_window"),
        )
        prov["architecture"] = "extracted (config.json)" if arch.architecture else "unavailable"
        if arch.key_length is None and arch.embedding_length and arch.n_heads:
            arch.key_length = arch.embedding_length // arch.n_heads
            prov["key_length"] = "derived"
        arch.value_length = arch.key_length
        if arch.n_kv_heads is None and arch.n_heads:
            arch.n_kv_heads = arch.n_heads
            prov["n_kv_heads"] = "derived (assumed = n_heads)"
        warnings = list(st.warnings)
        if not cfg:
            warnings.append("No config.json next to the safetensors file: architecture unknown.")
        dt_counts: Counter = Counter()
        dt_bytes: Counter = Counter()
        layer_re = re.compile(r"\.layers?\.(\d+)\.")
        layers: dict[int, dict] = defaultdict(lambda: {"n_params": 0, "nbytes": 0, "types": Counter()})
        for t in st.tensors:
            dt_counts[t.dtype] += 1
            dt_bytes[t.dtype] += t.nbytes
            m = layer_re.search(t.name)
            if m:
                L = layers[int(m.group(1))]
                L["n_params"] += t.n_elements
                L["nbytes"] += t.nbytes
                L["types"][t.dtype] += 1
        n_params = sum(t.n_elements for t in st.tensors)
        total = sum(t.nbytes for t in st.tensors)
        unknown = [d for d in dt_counts if d not in DTYPE_BYTES]
        if unknown:
            warnings.append(f"Unknown safetensors dtypes: {unknown}")
        return ModelAnalysis(
            format=ModelFormat.SAFETENSORS, path=str(path), file_size_bytes=st.file_size,
            name=cfg.get("_name_or_path") or Path(path).stem, n_params=n_params, n_tensors=len(st.tensors),
            tensor_data_bytes=total, architecture=arch,
            quantization=QuantizationInfo(tensor_type_counts=dict(dt_counts), tensor_type_bytes=dict(dt_bytes),
                                          bits_per_weight=total * 8 / n_params if n_params else None),
            layers=[LayerInfo(index=i, n_params=v["n_params"], nbytes=v["nbytes"], types=dict(v["types"]))
                    for i, v in sorted(layers.items())],
            metadata={"safetensors": st.metadata, "config": cfg},
            provenance=prov, warnings=warnings,
        )


INSPECTORS: dict[ModelFormat, ModelInspector] = {
    ModelFormat.GGUF: GGUFInspector(),
    ModelFormat.SAFETENSORS: SafetensorsInspector(),
}


def analyze_model(path: str | Path, include_tensors: bool = False) -> ModelAnalysis:
    path = Path(path)
    fmt = detect_format(path)
    inspector = INSPECTORS.get(fmt)
    if inspector is None:
        raise UnsupportedFormatError(
            f"Format '{fmt.value}' is not supported for analysis (supported: GGUF, Safetensors).",
            details={"path": str(path), "detected_format": fmt.value})
    return inspector.analyze(path, include_tensors)
