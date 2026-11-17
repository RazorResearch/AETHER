# Security Policy

AETHER is a local-first research workspace. It has no accounts, no hosted
backend and no telemetry, so the attack surface is intentionally small — but it
is not zero.

## Supported versions

| Version        | Status                        | Security fixes |
| -------------- | ----------------------------- | -------------- |
| `0.1.x-alpha`  | Active development (preview)  | Yes            |
| Older / forks  | Unmaintained                  | No             |

Only the current `0.1.x` line receives security fixes. Pre-release builds are
supported on a best-effort basis.

## Reporting a vulnerability

**Do not open a public issue, pull request or discussion for a security issue.**

Use GitHub's private vulnerability reporting:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Submit the advisory draft.

If private reporting is unavailable, contact a maintainer directly through GitHub
(listed in [GOVERNANCE.md](GOVERNANCE.md)) and ask for a private channel before
sharing details. Do not publish the issue while a fix is being prepared.

### What to include

- A short summary and the affected component (interface page, backend module,
  build tooling).
- Reproduction steps or a minimal proof of concept.
- Expected impact and the conditions required to exploit it.
- The version or commit you tested, plus OS and browser/runtime.
- Any suggested fix or mitigation.
- Whether you intend to disclose publicly and on what timeline.

Please do not include real model files, personal filesystem paths, credentials or
other people's data in the report.

## What to expect

- **Acknowledgement:** best effort within 5 working days.
- **Initial assessment:** triage and severity estimate within 10 working days.
- **Fix and disclosure:** coordinated; we aim to release a fix before public
  disclosure and will keep you informed of delays. The default disclosure window
  is 90 days from acknowledgement, or sooner by mutual agreement.
- **Credit:** given in the release notes and advisory if you want it.

AETHER is an unfunded research project: there is **no bug bounty** and no
guaranteed response time, only the commitments above made in good faith.

## Scope

In scope:

- **Frontend interface** — cross-site scripting through user-supplied metadata
  (model name, publisher, notes, experiment descriptions), unsafe URL or HTML
  handling, unsafe file handling in import flows, dependency vulnerabilities.
- **Local persistence** — data handling in `localStorage` that could leak
  information across users of the same browser profile.
- **Build and release tooling** — supply-chain issues in the build, leaked
  secrets, unsafe CI configuration.
- **Backend (when present)** — path traversal in model or experiment paths,
  unsafe deserialization, command injection, missing validation, local API
  endpoints reachable without authorization.
- **Engine integrations (future)** — unsafe handling of model files or engine
  profiles.

Out of scope, by design:

- The absence of an optimization engine, benchmark results or hardware detection.
- The fictional nature of demonstration data (it is labelled everywhere).
- Reports requiring an already-compromised machine, physical access, or
  self-inflicted `localStorage` modification.
- Social engineering, phishing simulations and physical attacks.
- Denial of service against a local development server you control.
- Vulnerabilities in third-party model weights or in software not distributed by
  this repository (report those upstream).

## Security posture

- No account system, no authentication secrets and no third-party API keys in the
  frontend.
- No outbound network requests from the interface at runtime (fonts are loaded
  from Google Fonts by the HTML shell; self-hosting them is a valid hardening
  step).
- All displayed telemetry is simulated — nothing is read from the GPU or the
  filesystem in this build.
- Workspace state lives in `localStorage` under `aether.workspace.v1` and never
  leaves the machine.

## Safe harbour

We will not pursue or support legal action against researchers who:

- make a good-faith effort to avoid privacy violations, data destruction and
  service disruption;
- test only against their own installation and data;
- report findings privately and give us reasonable time to respond before any
  public disclosure.

---

© RazorResearch — AETHER, Adaptive AI Optimization Platform.
