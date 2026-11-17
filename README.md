# AETHER

### Adaptive AI Optimization & Research Engine


<p align="center">
  <strong>An open-source research platform for making local AI models smarter, faster, and more memory-efficient.</strong>
</p>

<p align="center">
  <a href="https://github.com/RazorResearch">
    <img src="https://img.shields.io/badge/Research-RazorResearch-111827?style=for-the-badge" alt="RazorResearch" />
  </a>
  <img src="https://img.shields.io/badge/Status-Research%20%26%20Development-0891B2?style=for-the-badge" alt="Research and Development" />
  <img src="https://img.shields.io/badge/License-Apache%202.0-blue?style=for-the-badge" alt="Apache 2.0" />
  <img src="https://img.shields.io/badge/AI-Local%20Inference-0F766E?style=for-the-badge" alt="Local Inference" />
</p>

<p align="center">
  <em>Research. Optimize. Innovate.</em>
</p>


---

## Overview

**AETHER** is an open-source research initiative developed by [RazorResearch](https://github.com/RazorResearch), an independent research laboratory focused on artificial intelligence and computational efficiency.

Its primary objective is to investigate, develop, and evaluate methods that improve the efficiency of existing large language models (LLMs) on consumer-grade hardware.

Modern language models increasingly require substantial computational resources. However, model size alone does not determine inference efficiency. Memory allocation, numerical precision, attention mechanisms, hardware utilization, and inference strategies all influence the actual performance of a model.

AETHER explores how these dimensions can be optimized together.

Rather than building another language model from scratch, AETHER focuses on making existing models more accessible, efficient, and practical.

**Our research objective is simple: maximize model capabilities while minimizing computational requirements.**

## Research Objectives

AETHER investigates five complementary optimization dimensions.

| Research dimension | Objective                                                                      |
| ------------------ | ------------------------------------------------------------------------------ |
| Intelligence       | Preserve model capabilities and output quality                                 |
| Performance        | Increase inference throughput and reduce latency                               |
| Memory             | Reduce RAM and VRAM consumption                                                |
| Energy             | Improve computational and energy efficiency                                    |
| Adaptability       | Automatically select optimization strategies according to hardware constraints |

These dimensions are interdependent. An optimization that reduces memory consumption may increase latency or degrade model quality.

AETHER therefore approaches optimization as a multi-objective research problem rather than a collection of isolated techniques.

## Research Areas

### 01. Adaptive Quantization

Investigating how numerical precision can be allocated more intelligently across model weights.

Research directions include:

- Mixed-precision quantization.
- Layer-wise precision allocation.
- Tensor-level quantization.
- Importance-aware quantization.
- Calibration-based optimization.
- Sensitivity analysis.
- Automatic precision selection.

Existing approaches such as GPTQ, AWQ, HQQ, and llama.cpp importance-matrix quantization provide foundations for our experiments.

Our long-term objective is to investigate adaptive allocation strategies that preserve important model capabilities under strict memory budgets.

### 02. Memory Optimization

Investigating ways to reduce the memory footprint of language model inference.

Research directions include:

- KV Cache quantization.
- Adaptive KV Cache allocation.
- Memory-aware inference.
- CPU/GPU offloading.
- Activation memory management.
- Context-length optimization.
- Memory fragmentation analysis.

Existing research such as KIVI and PyramidKV provides important starting points.

### 03. Inference Acceleration

Investigating methods that improve generation speed and reduce inference latency.

Research directions include:

- Speculative decoding.
- Multi-Token Prediction.
- N-gram speculative decoding.
- FlashAttention integration.
- Kernel optimization.
- Prompt processing optimization.
- CPU/GPU execution strategies.

AETHER prioritizes integration and evaluation of established inference technologies before developing new implementations.

### 04. Model Compression and Architecture Optimization

Investigating methods that reduce model computational requirements while preserving useful capabilities.

Research directions include:

- Structured pruning.
- Unstructured pruning.
- Layer sensitivity analysis.
- Knowledge distillation.
- Architecture-aware optimization.
- Selective layer reduction.

Research references include Wanda and SliceGPT.

### 05. Adaptive Multi-Objective Optimization

This is one of AETHER's central research directions.

Instead of applying the same optimization pipeline to every model, AETHER aims to analyze the model, its architecture, and the available hardware before selecting appropriate strategies.

The optimization process will consider:

- Model quality.
- Generation speed.
- Peak memory consumption.
- Energy consumption.
- Hardware compatibility.

Multi-objective optimization and Pareto-front analysis will be investigated to identify configurations that offer different trade-offs.

Optuna is a potential foundation for automated experimental search.

---

## Scientific Approach

AETHER distinguishes between established techniques, experimental implementations, and original research hypotheses.

Every optimization must be evaluated against a reproducible baseline.

Our research methodology follows six principles:

1. **Reproducibility** — Experiments must be repeatable under documented conditions.
2. **Measurement** — Performance improvements must be supported by quantitative results.
3. **Scientific integrity** — Hypotheses must never be presented as proven discoveries.
4. **Compatibility** — Optimizations must respect model architecture and hardware capabilities.
5. **Transparency** — Limitations, failures, and negative results must be documented.
6. **Open research** — Research methods and results should be accessible to the community.

### Performance Evaluation

AETHER intends to evaluate models using independent measurements.

| Category          | Metrics                                                  |
| ----------------- | -------------------------------------------------------- |
| Generation        | Tokens per second                                        |
| Latency           | Time to First Token (TTFT), Time Per Output Token (TPOT) |
| Prompt processing | Prefill throughput                                       |
| GPU memory        | Peak VRAM                                                |
| System memory     | Peak RAM                                                 |
| Quality           | Per-task benchmark scores                                |
| Language modeling | Perplexity                                               |
| Energy            | Energy consumption per generated token                   |

Quality measurements will include appropriate evaluation datasets for reasoning, mathematics, programming, language understanding, and multilingual performance.

A faster model is not automatically a better model. Performance improvements must be evaluated alongside capability preservation.

---

## Architecture

AETHER is designed as a modular research platform.

Its architecture separates hardware analysis, model inspection, optimization strategies, inference execution, and scientific validation.

```text
                    AETHER
                      |
          +-----------+-----------+
          |                       |
     Hardware Analysis       Model Analysis
          |                       |
          +-----------+-----------+
                      |
              Bottleneck Analyzer
                      |
          +-----------+-----------+
          |           |           |
     Quantization   Memory    Inference
        Lab          Lab        Lab
          |           |           |
          +-----------+-----------+
                      |
             Multi-Objective
                Optimizer
                      |
              Experiment Engine
                      |
             Scientific Validation
                      |
             Results & Reports
```

### Core Components

| Component            | Responsibility                                     |
| -------------------- | -------------------------------------------------- |
| Hardware Analyzer    | Detect and profile available hardware              |
| Model Manager        | Discover and inspect local models                  |
| Bottleneck Analyzer  | Identify computational and memory limitations      |
| Capability Registry  | Determine optimization compatibility               |
| Optimization Engine  | Coordinate optimization strategies                 |
| Experiment Scheduler | Manage and prioritize experiments                  |
| Benchmark Engine     | Evaluate performance and model quality             |
| Artifact Manager     | Manage optimized models and experimental artifacts |
| API Layer            | Expose engine capabilities to the application      |

The architecture is designed to support additional inference backends and optimization methods over time.

## Technology Stack

AETHER aims to reuse established open-source technologies whenever appropriate.

| Technology            | Intended role                                   |
| --------------------- | ----------------------------------------------- |
| Python                | Research orchestration and backend              |
| C++                   | Performance-critical components                 |
| CUDA                  | NVIDIA GPU acceleration                         |
| FastAPI               | Local application API                           |
| llama.cpp             | Local model inference                           |
| GGUF                  | Initial model format                            |
| PyTorch               | Model analysis and experimentation              |
| Optuna                | Hyperparameter and multi-objective optimization |
| lm-evaluation-harness | Model evaluation                                |
| NVIDIA NVML           | GPU monitoring                                  |
| SQLite                | Local experimental database                     |
| React / TypeScript    | Desktop application interface                   |
| Tauri                 | Future desktop packaging                        |

These are architectural choices and integration targets. Their actual implementation and compatibility will be documented as development progresses.

---

## Hardware Research

AETHER is particularly interested in making modern AI models usable on consumer-grade computers.

Our initial development environment includes:

| Component        | Reference configuration |
| ---------------- | ----------------------- |
| GPU              | NVIDIA GeForce RTX 5060 |
| VRAM             | 8 GB                    |
| System RAM       | 16 GB                   |
| Operating system | Linux                   |
| Acceleration     | NVIDIA CUDA             |

This hardware configuration represents an initial experimental target, not a minimum system requirement.

The project intends to investigate optimization strategies for machines with limited memory and computational resources.

Initial experiments will prioritize smaller models before progressively exploring larger configurations.

## Development Status

AETHER is currently in its foundational research and development phase.

The project is being developed in parallel across two independent workstreams.

| Workstream               | Scope                                       | Status         |
| ------------------------ | ------------------------------------------- | -------------- |
| Frontend                 | Application interface and user experience   | In development |
| Backend                  | Model management, hardware analysis and API | In development |
| Research engine          | Optimization algorithms and experimentation | In development |
| Benchmark infrastructure | Reproducible evaluation                     | In development |
| Scientific publications  | Research reports and findings               | Planned        |

**Important:** AETHER is not yet a production-ready optimization engine. Planned capabilities must not be interpreted as currently implemented features.

---

## Running AETHER (engine + interface)

The interface displays **only data read from the AETHER engine** (`backend/`, Python/FastAPI).
There is no demonstration or simulated data: when the engine is not running, the UI says so
and shows nothing.

```bash
# 1. engine — http://127.0.0.1:8765 (API docs at /docs)
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
AETHER_MODEL_DIRS=/path/to/models python -m app.cli serve

# 2. interface — http://localhost:5173 (Vite proxies /api to the engine)
npm install
npm run dev
```

Optional: build llama.cpp with CUDA and set `AETHER_LLAMACPP_DIR` before starting the engine
to enable benchmarks, perplexity and quantization (see `backend/README.md`). A packaged build
can point the UI elsewhere with `VITE_AETHER_API`.

**Stack:** React 18, TypeScript (strict), Vite 5, Tailwind CSS 3, Recharts, lucide-react,
Zustand, React Router (`HashRouter`, Tauri-ready).

### What each page shows

| Page | Source |
|---|---|
| Overview | Live hardware (sparklines = this session's samples), measured throughput, engine counters and events |
| Models | Engine library: import by absolute path, folder scan, GGUF analysis (layers, heads, tensor mix, bits/weight) |
| Hardware | NVML GPU (VRAM, utilisation, temperature, power), CPU per-core load, RAM/swap, volumes, driver/CUDA versions |
| Optimization | Engine memory estimate (VRAM/RAM placement, OOM risk, KV cache, preset sizes) and ranked configuration search |
| Experiments | Engine experiment types, background jobs with live progress, real results or explicit errors |
| Benchmarks | llama-bench / llama-perplexity runs with full reproducibility records and A/B comparison |
| Activity | Engine audit log |
| Settings | UI preferences (browser) + read-only engine configuration |

Every value carries its provenance: **Live**, **Measured**, **Estimated** or **Proxy**. Missing
values are shown as “—”, never invented.

### Frontend architecture

```
src/
├── api/         typed client (client.ts), engine types (types.ts), adapters
├── store/       useEngineStore (engine data, polling) · useAppStore (UI prefs, persisted) · toasts
├── components/  layout · navigation · engine · charts · cards · tables · ui
├── pages/       Overview, Models, Hardware, Optimization, Experiments,
│                Benchmarks, Activity, Settings, About
├── hooks/       clock, chart theme
├── types/       UI-only types
└── utils/       formatting, comparison maths
```

The API contract is documented in `docs/API_CONTRACT.md`.

---

## Roadmap

### Phase I — Foundations

- [ ] Establish project architecture.
- [ ] Implement the local backend.
- [ ] Build hardware detection.
- [ ] Implement model discovery.
- [ ] Establish the API contract.
- [ ] Integrate the initial inference backend.
- [ ] Build the first benchmark infrastructure.

### Phase II — Scientific Measurement

- [ ] Implement baseline performance evaluation.
- [ ] Measure prefill and decode performance separately.
- [ ] Monitor CPU, RAM, GPU and VRAM utilization.
- [ ] Establish reproducible experimental protocols.
- [ ] Build the experimental database.
- [ ] Generate comparative reports.

### Phase III — Adaptive Quantization

- [ ] Integrate importance-matrix calibration.
- [ ] Implement quantization experiments.
- [ ] Evaluate mixed-precision strategies.
- [ ] Investigate layer-wise sensitivity.
- [ ] Develop automatic precision allocation.
- [ ] Measure capability preservation.

### Phase IV — Memory Optimization

- [ ] Investigate KV Cache quantization.
- [ ] Evaluate KIVI-inspired approaches.
- [ ] Evaluate PyramidKV-inspired approaches.
- [ ] Investigate adaptive memory allocation.
- [ ] Improve CPU/GPU offloading strategies.

### Phase V — Inference Acceleration

- [ ] Evaluate speculative decoding.
- [ ] Investigate Multi-Token Prediction.
- [ ] Evaluate N-gram speculative decoding.
- [ ] Benchmark FlashAttention compatibility.
- [ ] Investigate inference bottlenecks.

### Phase VI — Adaptive Optimization

- [ ] Integrate multi-objective optimization.
- [ ] Implement Pareto-front analysis.
- [ ] Develop hardware-aware optimization profiles.
- [ ] Automate configuration selection.
- [ ] Validate optimized models against original baselines.

### Phase VII — Open Research

- [ ] Publish reproducible experimental results.
- [ ] Release research documentation.
- [ ] Publish the first technical report.
- [ ] Open the project to external contributors.
- [ ] Investigate original optimization methods.

---

## Research Principles

AETHER is committed to responsible and transparent scientific development.

We do not consider an optimization successful solely because it reduces model size or increases generation speed.

An optimization must be evaluated across all relevant dimensions.

We explicitly distinguish:

- Established scientific methods.
- Existing implementations.
- Experimental adaptations.
- Original hypotheses.
- Independently validated results.

Negative results are valuable research outcomes and should be documented.

No performance claims should be published without sufficient experimental evidence.

## Open Source & Licensing

AETHER is intended to be distributed under the **Apache License 2.0**.

The project aims to provide:

- Open development.
- Transparent research.
- Reproducible experiments.
- Community contributions.
- Accessible documentation.
- Modular and extensible architecture.

Third-party models, datasets, libraries, and inference engines remain subject to their respective licenses and usage conditions.

---

## Contributing

We welcome developers, researchers, students, engineers, and AI enthusiasts interested in efficient local artificial intelligence.

Potential contribution areas include:

- Model optimization.
- Quantization research.
- CUDA and C++ development.
- Inference benchmarking.
- Hardware profiling.
- Python backend development.
- Scientific evaluation.
- Documentation and reproducibility.

Before contributing, please review the project's contribution guidelines and open issues.

Research contributions should include a description of the hypothesis, methodology, experimental setup, results, and limitations.

---

## Research References

AETHER builds upon existing scientific research and open-source infrastructure.

Selected foundational references:

| Research / Project                                                           | Area                          |
| ---------------------------------------------------------------------------- | ----------------------------- |
| [llama.cpp](https://github.com/ggml-org/llama.cpp)                           | Local inference and GGUF      |
| [GPTQ](https://github.com/IST-DASLab/gptq)                                   | Post-training quantization    |
| [AWQ](https://github.com/mit-han-lab/llm-awq)                                | Activation-aware quantization |
| [HQQ](https://github.com/mobiusml/hqq)                                       | Half-quadratic quantization   |
| [KIVI](https://github.com/jy-yuan/KIVI)                                      | KV Cache quantization         |
| [Optuna](https://github.com/optuna/optuna)                                   | Hyperparameter optimization   |
| [lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness) | Model evaluation              |
| [FlashAttention](https://github.com/Dao-AILab/flash-attention)               | Efficient attention           |
| [vLLM](https://github.com/vllm-project/vllm)                                 | High-throughput inference     |
| [Nsight Systems](https://developer.nvidia.com/nsight-systems)                | System-level profiling        |

These projects are research references and potential integration targets, not claims of completed integration.

---

## About RazorResearch

**AETHER is developed by RazorResearch**, an independent open-source research initiative exploring artificial intelligence, computational efficiency, and accessible AI technologies.

Our objective is to contribute to a future where advanced AI capabilities are not exclusively dependent on expensive hardware or large-scale infrastructure.

We believe that improving the efficiency of existing models is an important part of making artificial intelligence more accessible.

<p align="center">
  <strong>RAZORRESEARCH</strong><br/>
  Independent AI Research Laboratory<br/>
  <a href="https://github.com/RazorResearch">GitHub Organization</a>
</p>

<p align="center">
  <em>Research. Optimize. Innovate.</em>
</p>
