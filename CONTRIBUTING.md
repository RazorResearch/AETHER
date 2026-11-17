# Contributing to AETHER

Thank you for considering a contribution to AETHER, an open research project by
[RazorResearch](https://github.com/RazorResearch).

AETHER investigates how local language models can be made more efficient — in
intelligence, speed, memory footprint and energy use — without hiding the
trade-offs. The project is early: what exists today is a research workspace and
a backend foundation, not an optimization engine.

This document explains how to contribute in a way that stays useful, reviewable
and scientifically honest.

---

## 1. Project status and scope

| Workstream  | State                                                              |
| ----------- | ------------------------------------------------------------------ |
| Frontend    | Interface foundation, v0.1 alpha (this repository root)             |
| Backend     | Local API foundation under `backend/`, in progress                  |
| Engine      | Not implemented — no quantization, CUDA or inference engine exists  |

**Non-negotiable rules**

1. **Never present demonstration data as measurement.** Every simulated value
   must stay visually labelled (`Demo data`, `Simulated`, `Demo series`) and
   documented as fictional.
2. **Never claim an engine capability that does not exist.** Buttons that would
   require the engine must report `Engine unavailable` / `Coming soon` instead of
   faking a successful run.
3. **Never invent benchmark results.** No placeholder "optimized" numbers,
   speedups, perplexity gains or energy savings may be added without a real,
   reproducible measurement produced by AETHER itself.
4. **Keep the workspace local.** No account system, no third-party analytics, no
   telemetry upload, no external backend calls from the interface.

Pull requests that break these rules will be closed, however polished they are.

---

## 2. Ways to contribute

- **Bug reports** — interface defects, broken navigation, layout issues, type or
  build failures. Use the bug report template.
- **Interface work** — accessibility, keyboard navigation, responsive behaviour,
  component quality, wording.
- **Documentation** — setup guides, architecture notes, metric definitions,
  clarifications of what the interface does and does not do.
- **Backend** — FastAPI endpoints, model metadata inspection, hardware
  inspection, persistence. Coordinate first: `backend/` is an active workstream.
- **Research proposals** — hypotheses, experimental designs, evaluation
  protocols. Use the research proposal template.

For non-trivial work, open an issue before writing code so the design can be
discussed. Small fixes (typos, obvious bugs, contrast issues) can go straight to a
pull request.

---

## 3. Development setup

### Frontend (required for interface work)

Requirements: Node.js 18+ and npm. No environment variables, no backend, no
account.

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # TypeScript, strict
npm run build      # type-check + production build in dist/
```

### Backend (only for backend work)

The Python backend lives in `backend/` and is developed by a separate
workstream. Use an isolated virtual environment inside `backend/`, never commit
it, and never point the interface at a remote service. If backend setup
instructions are missing for what you need, open an issue rather than guessing
at a shared environment.

---

## 4. Engineering conventions

### Frontend

- **TypeScript strict** — no implicit `any`, no unused locals or parameters.
  `npm run typecheck` must pass.
- **Design tokens only** — colors come from the CSS variables exposed through
  Tailwind (`bg-surface`, `text-ink-dim`, `border-line`, `accent`, …). Do not
  hardcode hex values in components; both themes must keep working.
- **Component placement** — `src/components/{layout,navigation,charts,cards,tables,ui}`
  for reusable pieces, `src/pages/` for routed screens, `src/data/` for
  demonstration datasets, `src/store/` for persisted state.
- **Engine contracts** — types describing future engine payloads belong in
  `src/types/`. Native telemetry stays behind `src/utils/systemBridge.ts`.
- **Accessibility** — every control needs an accessible name, visible focus,
  keyboard operation and sufficient contrast in both themes. Never remove focus
  outlines without an equivalent replacement.
- **Desktop behaviour** — interfaces must remain usable from 1024 px upward;
  tables scroll horizontally instead of overflowing the layout.
- **State** — local UI state in components, shared workspace state in the Zustand
  store. Persisted schemas get a version and a migration path.
- **No decorative controls** — every button either performs a local action or
  states clearly that it is unavailable.

### Backend

- Keep the API local-only and explicit about failures (no silent fallbacks).
- Validate every path and identifier received from the interface.
- Never fabricate results: when an engine is absent, return a structured
  "unavailable" error, not sample metrics.

---

## 5. Branches and commits

- Branch from the current development branch: `feat/…`, `fix/…`, `docs/…`,
  `chore/…`.
- Use [Conventional Commits](https://www.conventionalcommits.org/):

  ```
  feat(ui): add per-core load grid to hardware page
  fix(charts): keep baseline bars visible in light theme
  docs(readme): document the frontend workspace
  ```

  Useful scopes: `ui`, `charts`, `models`, `hardware`, `optimization`,
  `experiments`, `benchmarks`, `api`, `engine`, `docs`, `deps`.
- Keep commits focused and reviewable. Do not mix formatting churn with logic
  changes.
- Signing off (`git commit -s`) is appreciated but not required; there is no CLA.

---

## 6. Pull request checklist

Before opening a pull request:

- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] User-visible changes are listed under `Unreleased` in `CHANGELOG.md`.
- [ ] New or changed demonstration data is labelled as such.
- [ ] No secrets, tokens, personal paths or model files are committed.
- [ ] UI changes include a screenshot or a short description of what was viewed.
- [ ] Any limitation or unverified behaviour is stated explicitly.
- [ ] The change stays within the scope of this repository (no engine claims).

Pull requests need approval from one maintainer. Non-trivial changes are open for
comment for at least 72 hours before merge (lazy consensus). See
[GOVERNANCE.md](GOVERNANCE.md) for decision-making.

---

## 7. Scientific integrity

AETHER exists to make trade-offs measurable, not to look impressive.

- Report regressions as well as improvements. A profile that improves throughput
  but degrades perplexity must say so.
- Describe the environment behind any measurement (model, quantization, hardware,
  runtime, context length, batch size).
- State clearly when a number is estimated, simulated or from a third party.
- Do not present a demonstration dataset as a research result.

---

## 8. Reporting security issues

Do **not** open a public issue for a vulnerability. Follow
[SECURITY.md](SECURITY.md) instead.

---

## 9. Community standards

All participants are expected to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
Research integrity concerns can be raised privately with the maintainers.

---

## 10. License

By contributing, you agree that your contribution is licensed under the
**Apache License 2.0** (see [LICENSE](LICENSE)), and that you have the right to
submit it. No copyright assignment is required.

© RazorResearch — AETHER, Adaptive AI Optimization Platform.
