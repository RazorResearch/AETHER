# AETHER Engine (backend)

Python engine of AETHER — Adaptive AI Optimization Platform (RazorResearch). Analyses local models,
measures them on the local machine and searches for configurations that balance quality, speed, memory and
energy. Exposes a REST API consumed by the AETHER frontend.

Documentation: [API contract](../docs/API_CONTRACT.md) · [Architecture](../docs/ARCHITECTURE.md) ·
[Methods](../docs/OPTIMIZATION_METHODS.md) · [Research](../docs/RESEARCH.md) ·
[Experiments](../docs/EXPERIMENTS.md) · [Roadmap](../docs/ROADMAP.md)

## Quick start

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m app.cli serve            # http://127.0.0.1:8765/docs
```

Other commands:

```bash
python -m app.cli hardware                       # hardware snapshot as JSON
python -m app.cli analyze /path/model.gguf       # model analysis
python -m pytest -q                              # test suite (no GPU, no llama.cpp needed)
AETHER_TEST_GGUF=/path/model.gguf python -m pytest -q -k real   # optional real-file check
```

## Optional: llama.cpp (benchmarks, perplexity, quantization)

AETHER drives the official llama.cpp tools (including `llama-server` for the Chat); it does not download or build
them. Easiest: unpack an official release into `backend/vendor/llama.cpp/<build>/` (auto-detected, gitignored).

```bash
git clone https://github.com/ggml-org/llama.cpp && cd llama.cpp
cmake -B build -DGGML_CUDA=ON && cmake --build build --config Release -j
export AETHER_LLAMACPP_DIR=$PWD/build
```

Without it, the engine runs in analysis/estimation mode and benchmark endpoints answer
`503 ENGINE_UNAVAILABLE`.

## What works today (v0.1)

| Feature | State |
|---|---|
| Hardware detection (NVIDIA via NVML, CPU, RAM, disks, CUDA/driver) | working, CPU-only safe |
| GGUF / Safetensors import and analysis | working (GGUF validated on real files) |
| Memory / KV cache / preset size estimation | working — estimates, labelled as such |
| Benchmarks (llama-bench, perplexity) with peak RAM/VRAM/energy | working with llama.cpp installed |
| Experiments: sensitivity proxy, KV comparison, preset comparison | working; GPU ones need confirmation |
| Optimization search (profiles, Pareto) | runtime configs only; `optimization_applied` always false |
| Chat (llama-server): streaming, stop, live metrics, profiles, configuration comparison | working (verified on RTX 5060) |
| lm-evaluation-harness, pruning, PyTorch inference | not implemented (explicit errors) |

Licence: Apache-2.0.
