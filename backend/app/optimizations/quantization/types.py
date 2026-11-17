"""GGML tensor types and llama.cpp file types.

Block sizes / byte sizes mirror ``ggml_type_traits`` in ggml (ggml/src/ggml.c).
They are used to compute *exact* tensor sizes from GGUF tensor descriptors and
to estimate the memory cost of a target quantization. The unit tests check the
table against the data section size of real/synthetic GGUF files.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class GGMLType:
    id: int
    name: str
    block_size: int
    type_size: int  # bytes per block

    @property
    def bits_per_weight(self) -> float:
        return self.type_size * 8 / self.block_size

    def nbytes(self, n_elements: int) -> int:
        if n_elements % self.block_size:
            raise ValueError(f"{self.name}: {n_elements} elements not divisible by block {self.block_size}")
        return n_elements // self.block_size * self.type_size


_TYPES = [
    GGMLType(0, "F32", 1, 4),
    GGMLType(1, "F16", 1, 2),
    GGMLType(2, "Q4_0", 32, 18),
    GGMLType(3, "Q4_1", 32, 20),
    GGMLType(6, "Q5_0", 32, 22),
    GGMLType(7, "Q5_1", 32, 24),
    GGMLType(8, "Q8_0", 32, 34),
    GGMLType(9, "Q8_1", 32, 36),
    GGMLType(10, "Q2_K", 256, 84),
    GGMLType(11, "Q3_K", 256, 110),
    GGMLType(12, "Q4_K", 256, 144),
    GGMLType(13, "Q5_K", 256, 176),
    GGMLType(14, "Q6_K", 256, 210),
    GGMLType(15, "Q8_K", 256, 292),
    GGMLType(16, "IQ2_XXS", 256, 66),
    GGMLType(17, "IQ2_XS", 256, 74),
    GGMLType(18, "IQ3_XXS", 256, 98),
    GGMLType(19, "IQ1_S", 256, 50),
    GGMLType(20, "IQ4_NL", 32, 18),
    GGMLType(21, "IQ3_S", 256, 110),
    GGMLType(22, "IQ2_S", 256, 82),
    GGMLType(23, "IQ4_XS", 256, 136),
    GGMLType(24, "I8", 1, 1),
    GGMLType(25, "I16", 1, 2),
    GGMLType(26, "I32", 1, 4),
    GGMLType(27, "I64", 1, 8),
    GGMLType(28, "F64", 1, 8),
    GGMLType(29, "IQ1_M", 256, 56),
    GGMLType(30, "BF16", 1, 2),
    GGMLType(34, "TQ1_0", 256, 54),
    GGMLType(35, "TQ2_0", 256, 66),
    GGMLType(39, "MXFP4", 32, 17),
]

GGML_TYPES: dict[int, GGMLType] = {t.id: t for t in _TYPES}
GGML_TYPES_BY_NAME: dict[str, GGMLType] = {t.name: t for t in _TYPES}


def ggml_type(key: int | str) -> GGMLType | None:
    if isinstance(key, int):
        return GGML_TYPES.get(key)
    return GGML_TYPES_BY_NAME.get(key.upper())


# llama.cpp ``llama_ftype`` (general.file_type) -> preset name.
LLAMA_FILE_TYPES: dict[int, str] = {
    0: "F32", 1: "F16", 2: "Q4_0", 3: "Q4_1", 7: "Q8_0", 8: "Q5_0", 9: "Q5_1",
    10: "Q2_K", 11: "Q3_K_S", 12: "Q3_K_M", 13: "Q3_K_L", 14: "Q4_K_S", 15: "Q4_K_M",
    16: "Q5_K_S", 17: "Q5_K_M", 18: "Q6_K", 19: "IQ2_XXS", 20: "IQ2_XS", 21: "Q2_K_S",
    22: "IQ3_XS", 23: "IQ3_XXS", 24: "IQ1_S", 25: "IQ4_NL", 26: "IQ3_S", 27: "IQ3_M",
    28: "IQ2_S", 29: "IQ2_M", 30: "IQ4_XS", 31: "IQ1_M", 32: "BF16", 36: "TQ1_0",
    37: "TQ2_0", 38: "MXFP4_MOE",
}

# Presets accepted by ``llama-quantize`` that AETHER exposes first (spec: Q2..Q8).
QUANT_PRESETS: list[str] = [
    "Q2_K", "Q3_K_S", "Q3_K_M", "Q3_K_L", "Q4_0", "Q4_K_S", "Q4_K_M",
    "Q5_0", "Q5_K_S", "Q5_K_M", "Q6_K", "Q8_0", "IQ4_XS", "F16", "BF16",
]

# Dominant tensor type of each preset (used for *first-order* size estimates
# only; real presets mix types per tensor, e.g. Q4_K_M keeps some Q6_K).
PRESET_DOMINANT_TYPE: dict[str, str] = {
    "Q2_K": "Q2_K", "Q3_K_S": "Q3_K", "Q3_K_M": "Q3_K", "Q3_K_L": "Q3_K", "Q4_0": "Q4_0",
    "Q4_K_S": "Q4_K", "Q4_K_M": "Q4_K", "Q5_0": "Q5_0", "Q5_K_S": "Q5_K", "Q5_K_M": "Q5_K",
    "Q6_K": "Q6_K", "Q8_0": "Q8_0", "IQ4_XS": "IQ4_XS", "F16": "F16", "BF16": "BF16",
}

# Nominal bit-width -> ggml type used by the adaptive bit allocator.
BITS_TO_TYPE: dict[int, str] = {2: "Q2_K", 3: "Q3_K", 4: "Q4_K", 5: "Q5_K", 6: "Q6_K", 8: "Q8_0", 16: "F16"}
# Fallback when a row length is not a multiple of 256 (K-quants unavailable).
BITS_TO_TYPE_BLOCK32: dict[int, str] = {4: "Q4_0", 5: "Q5_0", 8: "Q8_0", 16: "F16"}

# KV cache types accepted by llama.cpp ``-ctk/-ctv``.
KV_CACHE_TYPES: list[str] = ["f32", "f16", "bf16", "q8_0", "q5_1", "q5_0", "q4_1", "q4_0", "iq4_nl"]


def kv_bytes_per_element(cache_type: str) -> float:
    t = ggml_type(cache_type)
    if t is None:
        raise ValueError(f"unknown KV cache type {cache_type!r}")
    return t.type_size / t.block_size
