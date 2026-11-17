"""EXP-001 — adaptive bit allocation vs uniform quantization (weight-space proxy).

Usage:
    python scripts/run_exp001.py --model path/to/model-F16.gguf --out results/exp001.json
    python scripts/run_exp001.py --synthetic --out results/exp001-synthetic.json   # pipeline check only

CPU only, reads weights via memory-mapping (no GPU, no download). For a 0.5B-3B
F16 model expect a few minutes and < 2 GB RAM with the default row subsample.
The output is a *proxy* comparison; see docs/EXPERIMENTS.md for the validation
protocol (quantize with --tensor-type overrides, then measure perplexity).
"""

from __future__ import annotations

import argparse
import json
import platform
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import __version__  # noqa: E402
from app.optimizations.quantization.planner import adaptive_experiment  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--model", type=Path)
    g.add_argument("--synthetic", action="store_true", help="tiny random llama model (pipeline check)")
    ap.add_argument("--bits", type=int, nargs="+", default=[2, 3, 4, 5, 6, 8])
    ap.add_argument("--budgets", type=float, nargs="+", default=[3.5, 4.5, 5.5])
    ap.add_argument("--max-rows", type=int, default=4096)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()

    model = a.model
    if a.synthetic:
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from tests.helpers import make_llama_gguf

        model = make_llama_gguf(Path(tempfile.mkdtemp()) / "synthetic-llama-f16.gguf", n_layers=4)
    t0 = time.perf_counter()
    res = adaptive_experiment(model, a.bits, a.budgets, a.max_rows,
                              progress=lambda f, m: print(f"\r{f:5.1%} {m[:60]:<60}", end="", file=sys.stderr))
    print(file=sys.stderr)
    res["run"] = {"experiment": "EXP-001", "aether_engine": __version__, "date": datetime.now(timezone.utc).isoformat(),
                  "synthetic": a.synthetic, "python": platform.python_version(), "machine": platform.machine(),
                  "duration_s": round(time.perf_counter() - t0, 2), "max_rows": a.max_rows}
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(res, indent=2))
    for c in res["comparisons"]:
        u = c["best_uniform_within_budget"]
        print(f"budget {c['budget_bits_per_weight']:.2f} bpw | adaptive {c['adaptive']['bits_per_weight']:.3f} bpw "
              f"D={c['adaptive']['proxy_distortion']:.4g} {c['adaptive']['type_histogram']} | "
              f"uniform {u['method'] if u else '-'} {u['bits_per_weight'] if u else float('nan'):.3f} bpw "
              f"D={u['proxy_distortion'] if u else float('nan'):.4g} | ratio {c['proxy_distortion_ratio']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
