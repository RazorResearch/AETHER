# Governance

AETHER is an open research project initiated and maintained by
[RazorResearch](https://github.com/RazorResearch), an independent research
laboratory. This document describes how decisions are made while the project is
in its foundation phase, and how that may change as it grows.

The goal is simple: keep the project technically coherent and scientifically
honest, while remaining open to outside contribution.

---

## 1. Principles

1. **Evidence over claims.** Features and numbers ship with their provenance;
   unmeasured results are never presented as measured.
2. **Local-first.** No accounts, no hosted dependency, no hidden data collection.
3. **Explicit trade-offs.** Intelligence, throughput, memory and energy are
   competing objectives; the project documents the trade-off rather than hiding
   it.
4. **Open process.** Design discussions, reviews and release notes are public,
   except for security and conduct matters.
5. **Reversibility.** Prefer small, reviewable, reversible changes over large
   irreversible ones.

---

## 2. Workstreams

| Workstream         | Scope                                                        |
| ------------------ | ------------------------------------------------------------ |
| Frontend           | Desktop interface, design system, local workspace state      |
| Backend / API      | Model metadata, hardware inspection, local HTTP API          |
| Research engine    | Quantization, KV cache, offloading, evaluation (not started)  |
| Documentation      | Specifications, metric definitions, research notes            |

Each workstream is coordinated by at least one maintainer. Cross-workstream
changes (for example, an API contract consumed by the interface) require
agreement from maintainers of both sides before implementation.

---

## 3. Roles

**Contributor** — anyone who opens an issue, proposes a design, improves docs or
submits code. No formal status is required.

**Reviewer** — a contributor with a sustained track record in a workstream who is
invited to review pull requests. Reviewers can approve changes in their area;
merge rights remain with maintainers.

**Maintainer** — responsible for reviewing and merging, cutting releases,
triaging security reports, enforcing the code of conduct and protecting the
project's scientific rules. Maintainers are appointed by existing maintainers
based on sustained, high-quality contribution.

**Lead maintainer** — a RazorResearch maintainer who breaks ties, owns the
roadmap and holds final responsibility for releases. The role is currently held
by RazorResearch; it can be delegated or expanded as the team grows.

Role changes are announced in the repository (a pull request updating this file
or a pinned issue).

---

## 4. Decision making

### Default: lazy consensus

Routine changes (bug fixes, documentation, refactors, new interface components
that follow existing patterns) are decided by pull-request review. A pull request
with approval from one maintainer and no unresolved objection after 72 hours may
be merged.

### Significant changes: explicit agreement

The following require agreement from at least two maintainers, or from the lead
maintainer when fewer than two are active:

- Public API, data model or persisted-state schema changes.
- Adding a dependency that affects the runtime bundle or the backend.
- Architectural changes (routing, state management, engine contracts).
- Anything that changes what AETHER claims to do.
- Changes to LICENSE, this document, CODE_OF_CONDUCT.md or SECURITY.md.

Proposals are made as issues labelled `design` or as draft pull requests, and are
left open for at least 72 hours for comment.

### Tie-breaking

If maintainers cannot reach agreement, the lead maintainer decides and records
the reasoning in the issue or pull request. Decisions may be revisited with new
evidence, not with repetition.

### Scientific disputes

Methodology questions (what counts as a valid benchmark, how a metric is
defined, whether a comparison is fair) are resolved by evidence: a reproducible
protocol beats an opinion. The project's integrity rules in
[CONTRIBUTING.md](CONTRIBUTING.md) cannot be overridden by a majority vote.

---

## 5. Releases

- The project follows [Semantic Versioning](https://semver.org/).
- While in `0.x`, breaking changes may occur in minor releases and are documented
  in [CHANGELOG.md](CHANGELOG.md).
- Maintainers cut releases; every release includes a changelog entry, a version
  bump and a tag (`v0.1.0-alpha`, …).
- Pre-releases are explicitly labelled (`-alpha`, `-beta`); they must not be
  described as production-ready.
- A release must not claim engine capabilities that are not implemented.

---

## 6. Contributions and review

- Contributions are accepted under the Apache License 2.0, without a CLA.
- Reviews evaluate correctness, scope, accessibility, performance, testability and
  honesty of displayed data.
- Maintainers may decline a contribution that conflicts with the project's scope,
  even if the code is technically sound. The reason is stated in the pull request.

---

## 7. Security and conduct

- Security reports are handled privately per [SECURITY.md](SECURITY.md).
- Conduct reports are handled per [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Maintainers involved in a report do not adjudicate that report.

---

## 8. Amendments

Changes to this document are proposed as a pull request, open for at least seven
days, and require approval from two maintainers (or the lead maintainer). The
change and its rationale are recorded in the pull request.

---

© RazorResearch — AETHER, Adaptive AI Optimization Platform.
