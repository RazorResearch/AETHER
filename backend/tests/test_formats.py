import struct

import pytest

from app.core.errors import UnsupportedFormatError
from app.formats.detect import ModelFormat, detect_format
from app.formats.gguf import ArraySummary, read_gguf, write_gguf
from app.formats.safetensors import read_safetensors
from app.optimizations.quantization.types import ggml_type
from tests.conftest import real_gguf
from tests.helpers import make_llama_gguf


def test_gguf_roundtrip_and_exact_sizes(tmp_path):
    p = make_llama_gguf(tmp_path / "m.gguf")
    g = read_gguf(p)
    assert g.version == 3
    assert g.architecture == "llama"
    assert g.arch_key("block_count") == 2
    assert g.get("general.file_type") == 1
    # large arrays are summarised, not loaded
    assert isinstance(g.metadata["tokenizer.ggml.tokens"], ArraySummary)
    assert g.array_length("tokenizer.ggml.tokens") == 300
    # computed tensor extents reach the end of the file exactly (last tensor is padded)
    end = max(t.offset + t.nbytes for t in g.tensors)
    assert g.data_offset % g.alignment == 0
    assert g.data_offset + end <= g.file_size < g.data_offset + end + g.alignment
    assert not g.warnings


def test_gguf_quantized_tensor_size(tmp_path):
    q8 = ggml_type("Q8_0")
    n = 256 * 4
    data = b"\0" * q8.nbytes(n)
    p = tmp_path / "q.gguf"
    write_gguf(p, {"general.architecture": "llama"}, [("w.weight", [256, 4], q8.id, data)])
    t = read_gguf(p).tensors[0]
    assert t.type_name == "Q8_0" and t.nbytes == 34 * 32


def test_gguf_rejects_bad_magic_and_truncation(tmp_path):
    bad = tmp_path / "bad.gguf"
    bad.write_bytes(b"NOPE" + b"\0" * 32)
    with pytest.raises(UnsupportedFormatError):
        read_gguf(bad)
    good = make_llama_gguf(tmp_path / "ok.gguf")
    trunc = tmp_path / "trunc.gguf"
    trunc.write_bytes(good.read_bytes()[:200])
    with pytest.raises(UnsupportedFormatError) as e:
        read_gguf(trunc)
    assert e.value.code == "CORRUPT_FILE"


def test_gguf_unsupported_version(tmp_path):
    p = tmp_path / "v1.gguf"
    p.write_bytes(b"GGUF" + struct.pack("<I", 1) + b"\0" * 32)
    with pytest.raises(UnsupportedFormatError):
        read_gguf(p)


def test_quant_type_table():
    assert ggml_type("Q4_K").bits_per_weight == 4.5
    assert ggml_type("Q6_K").bits_per_weight == 6.5625
    assert ggml_type("Q8_0").bits_per_weight == 8.5
    assert ggml_type("Q2_K").bits_per_weight == 2.625
    assert ggml_type(1).name == "F16"
    with pytest.raises(ValueError):
        ggml_type("Q4_K").nbytes(100)


def _write_safetensors(path, tensors, meta=None):
    import json

    header, off = {}, 0
    for name, (dtype, shape, nbytes) in tensors.items():
        header[name] = {"dtype": dtype, "shape": shape, "data_offsets": [off, off + nbytes]}
        off += nbytes
    if meta:
        header["__metadata__"] = meta
    h = json.dumps(header).encode()
    path.write_bytes(struct.pack("<Q", len(h)) + h + b"\0" * off)


def test_safetensors_reader_and_detection(tmp_path):
    p = tmp_path / "model.safetensors"
    _write_safetensors(p, {"model.layers.0.mlp.weight": ("F16", [8, 4], 64),
                           "model.layers.1.mlp.weight": ("F16", [8, 4], 64)}, {"format": "pt"})
    (tmp_path / "config.json").write_text('{"architectures": ["LlamaForCausalLM"], "num_hidden_layers": 2,'
                                          ' "hidden_size": 8, "num_attention_heads": 2}')
    assert detect_format(p) == ModelFormat.SAFETENSORS
    st = read_safetensors(p)
    assert len(st.tensors) == 2 and st.metadata == {"format": "pt"}
    assert st.hf_config["num_hidden_layers"] == 2


def test_detect_unknown(tmp_path):
    p = tmp_path / "x.bin"
    p.write_bytes(b"hello world, not a model")
    assert detect_format(p) == ModelFormat.UNKNOWN


@pytest.mark.skipif(real_gguf() is None, reason="set AETHER_TEST_GGUF to a real .gguf to run")
def test_real_gguf_sizes_match_file():
    g = read_gguf(real_gguf())
    end = max(t.offset + t.nbytes for t in g.tensors)
    assert g.data_offset + end == g.file_size
