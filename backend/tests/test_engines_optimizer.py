import pytest

from app.benchmarks.records import comparability
from app.core.errors import EngineUnavailableError, ExecutionError, FeatureNotImplemented
from app.core.optimizer import Candidate, Metric, pareto_front, rank
from app.engines.base import BenchParams, RuntimeParams
from app.engines.llamacpp import LlamaCppEngine, parse_llama_bench_json
from app.engines.pytorch import PyTorchEngine
from app.optimizations.pruning import prune
from tests.helpers import fake_binaries


def test_parse_llama_bench_json():
    text = """some log line
[{"build_commit":"abc","build_number":1,"n_prompt":512,"n_gen":0,"avg_ts":2000.0,"stddev_ts":5,"samples_ts":[1995,2005]},
 {"build_commit":"abc","build_number":1,"n_prompt":0,"n_gen":128,"avg_ts":80.0,"stddev_ts":1,"samples_ts":[79,81]}]"""
    r = parse_llama_bench_json(text)
    assert r.prompt_tokens_per_s == 2000 and r.gen_tokens_per_s == 80
    assert r.prompt_eval_ms == pytest.approx(256.0)
    assert r.ttft_ms == pytest.approx(256.0 + 12.5)
    assert r.engine_version == "b1 (abc)"
    with pytest.raises(ExecutionError):
        parse_llama_bench_json("no json here")


def test_unavailable_engine_raises(tiny_gguf):
    e = LlamaCppEngine(binaries={})
    st = e.status()
    assert not st.available and st.reason
    with pytest.raises(EngineUnavailableError):
        e.bench(str(tiny_gguf), BenchParams())


def test_fake_llama_bench_perplexity_quantize(tiny_gguf, tmp_path):
    e = LlamaCppEngine(binaries=fake_binaries())
    assert e.status().available and e.version() == "b9999 (deadbee)"
    r = e.bench(str(tiny_gguf), BenchParams(repetitions=3, runtime=RuntimeParams(cache_type_k="q8_0")))
    assert r.gen_tokens_per_s == pytest.approx(52.6, rel=1e-3) and len(r.samples_gen_ts) == 3
    assert r.resources.peak_ram_bytes and r.resources.wall_time_s > 0
    ds = tmp_path / "wiki.txt"
    ds.write_text("hello " * 100)
    p = e.perplexity(str(tiny_gguf), str(ds), RuntimeParams())
    assert p.perplexity == 10.0 and p.uncertainty == pytest.approx(0.12345)
    out = tmp_path / "q.gguf"
    q = e.quantize(str(tiny_gguf), str(out), "Q4_K_M", tensor_types={r"blk\.0\.attn_q\.weight": "Q8_0"})
    assert out.exists() and q["size_bytes"] == tiny_gguf.stat().st_size


def test_failing_tool_reports_error(tmp_path):
    bad = tmp_path / "FAILME.gguf"
    bad.write_bytes(b"GGUF")
    with pytest.raises(ExecutionError) as e:
        LlamaCppEngine(binaries=fake_binaries()).bench(str(bad), BenchParams(repetitions=1))
    assert "failed to load" in e.value.details["stderr_tail"]


def test_pytorch_and_pruning_are_explicit():
    st = PyTorchEngine().status()
    if not st.available:
        with pytest.raises(EngineUnavailableError):
            PyTorchEngine().bench("x", BenchParams())
    else:
        with pytest.raises(FeatureNotImplemented):
            PyTorchEngine().bench("x", BenchParams())
    with pytest.raises(FeatureNotImplemented):
        prune()


def _c(id_, q, s, m, basis="measured"):
    return Candidate(id=id_, config={}, metrics={"quality": Metric(value=q, basis=basis),
                                                 "speed": Metric(value=s, basis=basis),
                                                 "memory": Metric(value=m, basis=basis)})


def test_pareto_front():
    cs = [_c("a", 1, 10, 100), _c("b", 2, 5, 100), _c("c", 1, 5, 200), _c("d", 0.5, 20, 50)]
    front = {c.id for c in pareto_front(cs, ["quality", "speed", "memory"])}
    assert front == {"a", "b", "d"}


def test_rank_profiles():
    cs = [_c("quality", 10, 1, 100), _c("fast", 1, 10, 100), _c("small", 1, 1, 10)]
    assert rank(cs, "maximum_intelligence")[0].id == "quality"
    assert rank(cs, "maximum_speed")[0].id == "fast"
    assert rank(cs, "minimum_memory")[0].id == "small"
    r = rank(cs, "custom", {"quality": 0, "speed": 1, "memory": 0})
    assert r[0].id == "fast" and all(x.validated for x in r)


def test_rank_marks_unmeasured_and_refuses_size_only():
    cs = [_c("a", 1, 2, 3, basis="estimated"), _c("b", 2, 1, 3, basis="estimated")]
    assert not any(r.validated for r in rank(cs, "balanced"))
    mem_only = [Candidate(id="x", config={}, metrics={"memory": Metric(value=1, basis="measured")})]
    with pytest.raises(ValueError, match="memory alone"):
        rank(mem_only, "minimum_memory")


def test_comparability():
    a = {"hardware_fingerprint": "h1", "engine": "llama.cpp", "engine_version": "b1",
         "params": {"n_prompt": 512, "n_gen": 128, "runtime": {"n_threads": None}}}
    assert comparability(a, a) == []
    b = {**a, "hardware_fingerprint": "h2", "params": {**a["params"], "n_prompt": 256}}
    issues = comparability(a, b)
    assert any("hardware" in i for i in issues) and any("prompt length" in i for i in issues)
