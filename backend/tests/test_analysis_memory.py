import pytest

from app.core.analyzer import analyze_model
from app.core.errors import UnsupportedFormatError
from app.optimizations.kv_cache.estimator import compare_kv_strategies, estimate_kv_cache
from app.optimizations.memory.planner import MemoryBudget, estimate_placement, plan_memory
from app.optimizations.quantization.planner import estimate_preset_size
from tests.helpers import GiB, make_llama_gguf


@pytest.fixture
def analysis(tiny_gguf):
    return analyze_model(tiny_gguf)


def test_analysis_fields(analysis):
    a = analysis
    ar = a.architecture
    assert (ar.architecture, ar.n_layers, ar.embedding_length, ar.n_heads, ar.n_kv_heads) == ("llama", 2, 256, 4, 2)
    assert ar.key_length == 64 and a.provenance["key_length"] == "derived"
    assert a.provenance["n_layers"] == "extracted"
    assert ar.vocab_size == 300
    assert a.quantization.file_type == "F16"
    assert len(a.layers) == 2
    assert {g.name for g in a.non_layer_tensors} == {"token_embd", "output", "output_norm"}
    assert a.n_params == sum(L.n_params for L in a.layers) + sum(g.n_params for g in a.non_layer_tensors)
    assert 16 <= a.quantization.bits_per_weight <= 16.5  # F16 + a few F32 norms


def test_missing_metadata_is_not_invented(tmp_path):
    p = make_llama_gguf(tmp_path / "nofiletype.gguf", file_type=None)
    a = analyze_model(p)
    assert a.quantization.file_type is None
    assert a.architecture.expert_count is None and a.provenance["expert_count"] == "unavailable"


def test_unsupported_format(tmp_path):
    p = tmp_path / "x.bin"
    p.write_bytes(b"not a model at all")
    with pytest.raises(UnsupportedFormatError):
        analyze_model(p)


def test_kv_cache_formula(analysis):
    est = estimate_kv_cache(analysis.architecture, 1000, "f16", "f16")
    # 2 layers * 2 kv heads * 64 dims * (K+V) * 2 bytes
    assert est.bytes_per_token == 2 * 2 * 64 * 2 * 2
    assert est.total_bytes == est.bytes_per_token * 1000
    q8 = estimate_kv_cache(analysis.architecture, 1000, "q8_0", "q8_0")
    assert q8.total_bytes == pytest.approx(est.total_bytes * 34 / 64, rel=1e-6)
    assert "flash attention" in " ".join(estimate_kv_cache(analysis.architecture, 10, "f16", "q4_0").notes)
    sizes = [e.total_bytes for e in compare_kv_strategies(analysis.architecture, 4096)]
    assert sizes == sorted(sizes, reverse=True)
    with pytest.raises(ValueError):
        estimate_kv_cache(analysis.architecture, 10, "q3_k", "f16")


def test_planner_cpu_only(analysis):
    plan = plan_memory(analysis, MemoryBudget(vram_available_bytes=None, ram_available_bytes=8 * GiB), 1024)
    assert plan.recommended.n_gpu_layers == 0
    assert plan.recommended.vram_total_bytes == 0 and plan.recommended.fits_vram is None


def test_planner_full_and_partial_offload(analysis):
    big = MemoryBudget(vram_available_bytes=4 * GiB, ram_available_bytes=8 * GiB,
                       vram_safety_margin_bytes=0, cuda_context_overhead_bytes=0)
    assert plan_memory(analysis, big, 512).recommended.n_gpu_layers == 3  # 2 layers + output
    one_layer = estimate_placement(analysis, big, 1, 512)
    two_layers = estimate_placement(analysis, big, 2, 512)
    tight = MemoryBudget(vram_available_bytes=one_layer.vram_total_bytes + 1024,
                         ram_available_bytes=8 * GiB, vram_safety_margin_bytes=0, cuda_context_overhead_bytes=0)
    assert two_layers.vram_total_bytes > tight.vram_available_bytes
    plan = plan_memory(analysis, tight, 512)
    assert plan.recommended.n_gpu_layers == 1 and "Partial" in plan.reason


def test_planner_will_not_fit(analysis):
    plan = plan_memory(analysis, MemoryBudget(vram_available_bytes=1024, ram_available_bytes=1024), 512)
    assert plan.recommended is None


def test_preset_size_estimate_ordering(analysis):
    sizes = [estimate_preset_size(analysis, p)["estimated_bytes"] for p in ("Q2_K", "Q4_K_M", "Q6_K", "Q8_0")]
    assert sizes == sorted(sizes)
    assert all(estimate_preset_size(analysis, "Q4_K_M")[k] for k in ("is_estimate", "note"))
