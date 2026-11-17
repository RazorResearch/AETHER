"""Multi-objective decision engine.

Candidates are configurations described by objective values. Each value carries
its *basis* ("measured", "estimated", "proxy") so the selection never hides
that an objective was not measured. Selection = Pareto front, then a weighted
score (min-max normalised within the front) according to a profile.

Rule: a candidate is only marked ``validated`` if all of its objectives used by
the profile were measured.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

OBJECTIVES = {
    "quality": "max",   # e.g. -perplexity, accuracy, or a bits-per-weight proxy
    "speed": "max",     # generation tokens/s
    "memory": "min",    # peak VRAM+RAM bytes
    "energy": "min",    # joules per generated token
}


class Profile(BaseModel):
    id: str
    name: str
    description: str
    weights: dict[str, float]


PROFILES: dict[str, Profile] = {p.id: p for p in [
    Profile(id="maximum_intelligence", name="Maximum Intelligence",
            description="Preserve model quality first; accept higher memory and lower speed.",
            weights={"quality": 0.7, "speed": 0.1, "memory": 0.1, "energy": 0.1}),
    Profile(id="balanced", name="Balanced Performance",
            description="Trade-off between quality, speed and memory.",
            weights={"quality": 0.35, "speed": 0.3, "memory": 0.2, "energy": 0.15}),
    Profile(id="minimum_memory", name="Minimum Memory",
            description="Smallest VRAM/RAM footprint that keeps quality acceptable.",
            weights={"quality": 0.2, "speed": 0.1, "memory": 0.6, "energy": 0.1}),
    Profile(id="maximum_speed", name="Maximum Speed",
            description="Highest tokens/s; quality and memory are secondary.",
            weights={"quality": 0.15, "speed": 0.6, "memory": 0.15, "energy": 0.1}),
    Profile(id="custom", name="Custom", description="User-defined weights.",
            weights={"quality": 0.25, "speed": 0.25, "memory": 0.25, "energy": 0.25}),
]}


class Metric(BaseModel):
    value: float
    basis: str = Field(description="measured | estimated | proxy")


class Candidate(BaseModel):
    id: str
    config: dict
    metrics: dict[str, Metric]
    feasible: bool = True
    notes: list[str] = []


class RankedCandidate(Candidate):
    score: float
    pareto_optimal: bool
    validated: bool
    unmeasured_objectives: list[str]


def dominates(a: Candidate, b: Candidate, objectives: list[str]) -> bool:
    better = False
    for o in objectives:
        va, vb = a.metrics[o].value, b.metrics[o].value
        if OBJECTIVES[o] == "min":
            va, vb = -va, -vb
        if va < vb:
            return False
        if va > vb:
            better = True
    return better


def pareto_front(cands: list[Candidate], objectives: list[str]) -> list[Candidate]:
    return [c for c in cands if not any(dominates(o, c, objectives) for o in cands if o is not c)]


def rank(cands: list[Candidate], profile: Profile | str, custom_weights: dict[str, float] | None = None
         ) -> list[RankedCandidate]:
    prof = PROFILES[profile] if isinstance(profile, str) else profile
    weights = dict(custom_weights or prof.weights) if prof.id == "custom" else dict(prof.weights)
    feasible = [c for c in cands if c.feasible]
    # objectives available on every feasible candidate
    objectives = [o for o in OBJECTIVES if weights.get(o, 0) > 0 and feasible
                  and all(o in c.metrics for c in feasible)]
    if not objectives:
        return []
    if len(objectives) == 1 and objectives[0] == "memory":
        # spec: never select a configuration on size alone
        raise ValueError("cannot rank on memory alone; at least one quality or speed metric is required")
    front_ids = {c.id for c in pareto_front(feasible, objectives)}
    total_w = sum(weights[o] for o in objectives)
    lo = {o: min(c.metrics[o].value for c in feasible) for o in objectives}
    hi = {o: max(c.metrics[o].value for c in feasible) for o in objectives}
    ranked = []
    for c in feasible:
        s = 0.0
        for o in objectives:
            span = hi[o] - lo[o]
            n = 1.0 if span == 0 else (c.metrics[o].value - lo[o]) / span
            if OBJECTIVES[o] == "min":
                n = 1.0 - n
            s += weights[o] / total_w * n
        unmeasured = [o for o in objectives if c.metrics[o].basis != "measured"]
        ranked.append(RankedCandidate(**c.model_dump(), score=round(s, 6), pareto_optimal=c.id in front_ids,
                                      validated=not unmeasured, unmeasured_objectives=unmeasured))
    ranked.sort(key=lambda r: (not r.pareto_optimal, -r.score))
    return ranked
