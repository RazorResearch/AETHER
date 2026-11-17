import numpy as np
import pytest

from app.optimizations.quantization.allocator import (Option, TensorChoices, _hull, build_choices,
                                                      exact_allocate, greedy_allocate, uniform_allocation)
from app.optimizations.quantization.planner import adaptive_experiment
from app.optimizations.quantization.sensitivity import WeightSpaceProxy, simulated_quant_error
from tests.helpers import make_llama_gguf


def test_simulated_error_decreases_with_bits():
    w = np.random.default_rng(0).standard_normal((64, 256)).astype(np.float32)
    errs = [simulated_quant_error(w, b) for b in (2, 3, 4, 5, 6, 8)]
    assert all(a > b for a, b in zip(errs, errs[1:]))
    assert errs[-1] < 1e-3
    assert simulated_quant_error(np.zeros((4, 32), np.float32), 4) == 0.0


def test_heavy_tails_are_more_sensitive():
    rng = np.random.default_rng(1)
    gauss = rng.standard_normal((64, 256)).astype(np.float32)
    heavy = rng.standard_t(2, (64, 256)).astype(np.float32)
    assert simulated_quant_error(heavy, 4) > simulated_quant_error(gauss, 4)


@pytest.mark.parametrize("dtype", ["F16", "BF16", "F32"])
def test_proxy_reads_all_float_types(tmp_path, dtype):
    p = make_llama_gguf(tmp_path / f"m-{dtype}.gguf", dtype=dtype)
    sens = WeightSpaceProxy().measure(p, [4, 8])
    assert len(sens) == 2 * 7 + 2  # 7 matrices per block + token_embd + output
    assert all(s.errors[4] > s.errors[8] > 0 for s in sens)


def test_proxy_refuses_quantized_source(tmp_path):
    from app.formats.gguf import write_gguf
    from app.optimizations.quantization.types import ggml_type

    q = ggml_type("Q8_0")
    p = tmp_path / "q.gguf"
    write_gguf(p, {"general.architecture": "llama"}, [("blk.0.attn_q.weight", [256, 2], q.id, b"\0" * q.nbytes(512))])
    with pytest.raises(ValueError, match="already quantized"):
        WeightSpaceProxy().measure(p, [4])


def _random_problem(n=8, seed=0):
    rng = np.random.default_rng(seed)
    choices = []
    for i in range(n):
        params = int(rng.integers(1, 10)) * 256
        base = rng.uniform(0.5, 3.0)
        opts = [Option(bits=b, type=f"T{b}", nbytes=params * b // 8, distortion=params * base * 4.0 ** -b)
                for b in (2, 3, 4, 5, 6, 8)]
        choices.append(TensorChoices(name=f"t{i}", n_params=params, options=opts))
    return choices


def test_hull_removes_dominated_points():
    opts = [Option(bits=2, type="a", nbytes=10, distortion=10), Option(bits=3, type="b", nbytes=20, distortion=9.9),
            Option(bits=4, type="c", nbytes=30, distortion=2), Option(bits=5, type="d", nbytes=40, distortion=3)]
    assert [o.type for o in _hull(opts)] == ["a", "c"]


@pytest.mark.parametrize("seed", range(5))
def test_greedy_close_to_exact_dp(seed):
    choices = _random_problem(seed=seed)
    lo = sum(c.options[0].nbytes for c in choices)
    hi = sum(c.options[-1].nbytes for c in choices)
    budget = (lo + hi) // 2
    g = greedy_allocate(choices, budget)
    e = exact_allocate(choices, budget, resolution=4000)
    assert g.feasible and g.total_bytes <= budget
    assert e.feasible and e.total_bytes <= budget
    # convex curves: greedy should be within a few % of the DP optimum
    assert g.total_distortion <= e.total_distortion * 1.10 + 1e-9


def test_greedy_beats_or_matches_uniform_at_equal_budget():
    choices = _random_problem(n=12, seed=3)
    for bits in (3, 4, 5):
        u = uniform_allocation(choices, bits)
        g = greedy_allocate(choices, u.total_bytes)
        assert g.total_bytes <= u.total_bytes
        assert g.total_distortion <= u.total_distortion + 1e-9


def test_greedy_infeasible_budget_reports_it():
    choices = _random_problem()
    g = greedy_allocate(choices, 1)
    assert g.feasible is False


def test_build_choices_respects_block_size():
    from app.optimizations.quantization.sensitivity import TensorSensitivity

    s = TensorSensitivity(name="x.weight", shape=[64, 4], n_params=256, source_type="F16",
                          errors={2: 0.5, 4: 0.1, 8: 0.01})
    (c,) = build_choices([s])
    # row length 64 is not a multiple of 256: no K-quants, 2-bit dropped
    assert {o.type for o in c.options} == {"Q4_0", "Q8_0"}


def test_adaptive_experiment_end_to_end(tmp_path):
    p = make_llama_gguf(tmp_path / "m.gguf")
    res = adaptive_experiment(p, bits=[2, 3, 4, 5, 6, 8], budgets_bpw=[4.0, 5.0])
    assert res["validated"] is False and "Proxy" in res["validation_note"]
    for comp in res["comparisons"]:
        a = comp["adaptive"]
        assert a["feasible"] and a["total_bytes"] <= comp["budget_bytes"]
        if comp["best_uniform_within_budget"]:
            assert a["proxy_distortion"] <= comp["best_uniform_within_budget"]["proxy_distortion"] + 1e-9
        assert all(v.lower() in {"q2_k", "q3_k", "q4_k", "q5_k", "q6_k", "q8_0"}
                   for v in a["tensor_type_overrides"].values())
