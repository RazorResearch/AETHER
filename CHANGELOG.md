# Changelog

All notable changes to AETHER are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project adheres to [Semantic Versioning](https://semver.org/). While AETHER
is in `0.x`, minor releases may contain breaking changes; they are listed here.

Version 0.1 is an **interface foundation**. It contains no optimization engine,
no quantization algorithm, no CUDA/C++ kernel and no inference runtime.

## [Unreleased]

### Added

- Governance and community documents: `LICENSE`, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, `GOVERNANCE.md`, `CITATION.cff` and issue
  templates.

## [0.1.0-alpha] - 2026-11-17

### Added

- **Workspace shell** — persistent sidebar (compact icon rail below 1024 px),
  contextual top bar with local clock, theme switch, data-provenance badge and
  engine status; scroll reset on navigation.
- **Overview** — simulated VRAM, system RAM, GPU and CPU indicators with radial
  gauges and micro-trends; 7/14/30-day demonstration throughput series; workspace
  counters; activity feed; library snapshot.
- **Models** — local model library with search, GGUF/Safetensors filtering,
  file-assisted import (name and size only, never read), manual registration,
  detail sheet and confirmed removal.
- **Hardware** — GPU, system memory, CPU topology (per-core load) and storage
  panels, live/paused simulation, and a telemetry-bridge test that reports the
  missing native host.
- **Optimization** — target model selection, seven toggleable strategies, three
  objective profiles with visible weights, advanced parameters, VRAM/RAM/context/
  speed constraints, sticky configuration summary, and an explicit
  "Optimization engine unavailable" flow.
- **Experiments** — creation with validation, strategy selection, status filters,
  detail view with status changes and deletion; records persisted in
  `localStorage`.
- **Benchmarks** — baseline versus optimized comparison (direction-aware relative
  index, radar view), seven documented scientific metrics, and local JSON report
  export carrying its own demonstration disclaimer.
- **Activity** — filterable, searchable event ledger with confirmed purge.
- **Settings** — dark and light themes from shared design tokens, GB/GiB units
  propagated across the interface, startup preferences, placeholder directories,
  and demo-workspace restoration.
- **About RazorResearch** — scope, research posture, roadmap, stack and license
  information.
- **Design system** — semantic color tokens, Inter/JetBrains Mono typography,
  reusable UI primitives (buttons, panels, badges, modals, fields, toggles,
  tooltips, progress, empty states, skeletons, toasts), theme-aware charts.
- **Engine contracts** — domain types and a `SystemBridge` interface prepared for
  a future Tauri command or Python telemetry sidecar.

### Security

- No account system, no outbound data collection and no third-party service calls
  from the interface. Workspace state stays in `localStorage`
  (`aether.workspace.v1`).

### Known limitations

- No optimization engine; "Start optimization" reports it as unavailable.
- All hardware telemetry, benchmark values and performance trends are simulated
  and labelled as such.
- No filesystem access: import stores metadata only.
- Interface available in English only.
- The Python backend under `backend/` is developed in a parallel workstream and is
  not part of this interface release.

[Unreleased]: https://github.com/RazorResearch/AETHER/compare/v0.1.0-alpha...HEAD
[0.1.0-alpha]: https://github.com/RazorResearch/AETHER/releases/tag/v0.1.0-alpha
