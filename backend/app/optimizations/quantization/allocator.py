"""Adaptive bit allocation under a memory budget (research prototype).

Problem (multiple-choice knapsack): choose one quantization type per tensor
to minimise total distortion  sum_i w_i * err_i(type_i)  subject to
sum_i bytes_i(type_i) <= budget.

* ``greedy_allocate`` — marginal-gain greedy on the lower convex hull of each
  tensor's (bytes, distortion) curve. Classic rate-distortion heuristic
  (cf. Shoham & Gersho 1988; used in mixed-precision work such as HAQ, HAWQ).
  Optimal for the continuous relaxation; near-optimal in practice.
* ``exact_allocate`` — dynamic programming over a discretised budget, for
  validating the greedy on small problems (tests).
* ``uniform_allocation`` — baselines (every tensor at the same type).

Nothing here is claimed to be novel; prior art is listed in docs/RESEARCH.md.
Costs use the *real* ggml type sizes so budgets match llama.cpp file sizes.
"""

from __future__ import annotations

import heapq

from pydantic import BaseModel

from app.optimizations.quantization.sensitivity import TensorSensitivity
from app.optimizations.quantization.types import BITS_TO_TYPE, BITS_TO_TYPE_BLOCK32, ggml_type


class Option(BaseModel):
    bits: int
    type: str
    nbytes: int
    distortion: float


class TensorChoices(BaseModel):
    name: str
    n_params: int
    options: list[Option]  # sorted by nbytes ascending


class Allocation(BaseModel):
    method: str
    assignment: dict[str, str]  # tensor name -> ggml type
    total_bytes: int
    total_distortion: float
    budget_bytes: int | None = None
    feasible: bool = True

    def bits_per_weight(self, n_params: int) -> float:
        return self.total_bytes * 8 / n_params if n_params else 0.0

    def tensor_type_overrides(self) -> dict[str, str]:
        """Patterns for ``llama-quantize --tensor-type`` (exact tensor names, regex-escaped)."""
        return {name.replace(".", r"\."): t for name, t in self.assignment.items()}


def build_choices(sens: list[TensorSensitivity], weighting: str = "params") -> list[TensorChoices]:
    """``weighting``: 'params' -> distortion = n_params * rel_err (default); 'relative' -> rel_err."""
    out = []
    for s in sens:
        row = s.shape[0]
        opts = []
        for bits, err in s.errors.items():
            tname = BITS_TO_TYPE.get(bits)
            t = ggml_type(tname) if tname else None
            if t is None or row % t.block_size:
                tname = BITS_TO_TYPE_BLOCK32.get(bits)
                t = ggml_type(tname) if tname else None
                if t is None or row % t.block_size:
                    continue
            w = s.n_params if weighting == "params" else 1.0
            opts.append(Option(bits=bits, type=t.name, nbytes=t.nbytes(s.n_params), distortion=w * err))
        if not opts:
            raise ValueError(f"no valid quantization type for tensor {s.name} (row length {row})")
        opts.sort(key=lambda o: (o.nbytes, o.distortion))
        out.append(TensorChoices(name=s.name, n_params=s.n_params, options=opts))
    return out


def _hull(opts: list[Option]) -> list[Option]:
    """Lower convex hull of (nbytes, distortion), keeping only dominating points."""
    pts: list[Option] = []
    for o in opts:
        if pts and o.distortion >= pts[-1].distortion:
            continue  # more bytes, no less distortion: dominated
        while len(pts) >= 2:
            a, b = pts[-2], pts[-1]
            # slope a->b must be steeper (more negative) than b->o
            if (b.distortion - a.distortion) * (o.nbytes - b.nbytes) >= (o.distortion - b.distortion) * (b.nbytes - a.nbytes):
                pts.pop()
            else:
                break
        pts.append(o)
    return pts


def _make(method: str, choices: list[TensorChoices], picks: list[Option], budget: int | None) -> Allocation:
    total = sum(p.nbytes for p in picks)
    return Allocation(method=method, assignment={c.name: p.type for c, p in zip(choices, picks)},
                      total_bytes=total, total_distortion=sum(p.distortion for p in picks),
                      budget_bytes=budget, feasible=budget is None or total <= budget)


def greedy_allocate(choices: list[TensorChoices], budget_bytes: int) -> Allocation:
    hulls = [_hull(c.options) for c in choices]
    level = [0] * len(choices)
    total = sum(h[0].nbytes for h in hulls)
    if total > budget_bytes:
        return _make("greedy", choices, [h[0] for h in hulls], budget_bytes)
    heap: list[tuple[float, int]] = []

    def push(i: int) -> None:
        h, l = hulls[i], level[i]
        if l + 1 < len(h):
            gain = (h[l].distortion - h[l + 1].distortion) / max(h[l + 1].nbytes - h[l].nbytes, 1)
            heapq.heappush(heap, (-gain, i))

    for i in range(len(choices)):
        push(i)
    while heap:
        _, i = heapq.heappop(heap)
        h, l = hulls[i], level[i]
        extra = h[l + 1].nbytes - h[l].nbytes
        if total + extra <= budget_bytes:
            total += extra
            level[i] += 1
            push(i)
        # otherwise this tensor cannot upgrade further within budget; drop it
    return _make("greedy", choices, [h[l] for h, l in zip(hulls, level)], budget_bytes)


def exact_allocate(choices: list[TensorChoices], budget_bytes: int, resolution: int = 2000) -> Allocation:
    """DP on a budget grid of ``resolution`` cells (costs rounded *up*: always feasible)."""
    unit = max(1, -(-budget_bytes // resolution))
    INF = float("inf")
    cap = budget_bytes // unit
    dp = [0.0] + [INF] * cap
    back: list[list[int]] = []
    for c in choices:
        new = [INF] * (cap + 1)
        arg = [-1] * (cap + 1)
        costs = [-(-o.nbytes // unit) for o in c.options]
        for b in range(cap + 1):
            if dp[b] == INF:
                continue
            for k, o in enumerate(c.options):
                nb = b + costs[k]
                if nb <= cap and dp[b] + o.distortion < new[nb]:
                    new[nb] = dp[b] + o.distortion
                    arg[nb] = k * (cap + 1) + b
        dp = new
        back.append(arg)
    best = min(range(cap + 1), key=lambda b: dp[b])
    if dp[best] == INF:
        return _make("exact_dp", choices, [c.options[0] for c in choices], budget_bytes)
    picks: list[Option] = []
    b = best
    for c, arg in zip(reversed(choices), reversed(back)):
        k, prev = divmod(arg[b], cap + 1)
        picks.append(c.options[k])
        b = prev
    return _make("exact_dp", choices, list(reversed(picks)), budget_bytes)


def uniform_allocation(choices: list[TensorChoices], bits: int) -> Allocation:
    picks = []
    for c in choices:
        match = [o for o in c.options if o.bits == bits]
        picks.append(match[0] if match else min(c.options, key=lambda o: abs(o.bits - bits)))
    return _make(f"uniform_{bits}bit", choices, picks, None)
