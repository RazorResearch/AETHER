"""Inference configuration profiles (saved) and hardware-aware presets (computed).

Presets are *starting points* computed from the detected hardware and the
model's analysis with the memory planner; their memory figures are estimates
and are labelled as such. They are not optimisation guarantees.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.core.analyzer import ModelAnalysis
from app.core.errors import NotFoundError, ValidationFailed
from app.database.db import new_id, utcnow
from app.engines.llama_server import RuntimeConfig, SamplingParams
from app.optimizations.memory.planner import plan_memory
from app.services.container import Services


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    model_id: str | None = None
    generation: SamplingParams = SamplingParams()
    runtime: RuntimeConfig = RuntimeConfig()
    notes: str | None = Field(None, max_length=2000)


class ProfilePatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    model_id: str | None = None
    generation: SamplingParams | None = None
    runtime: RuntimeConfig | None = None
    notes: str | None = None


class ProfileService:
    def __init__(self, s: Services):
        self.s = s

    def _decorate(self, row: dict) -> dict:
        m = self.s.db.get("models", row["model_id"]) if row.get("model_id") else None
        row["model"] = ({"id": m["id"], "name": m["name"], "path": m["path"], "quantization": m["quantization"],
                         "format": m["format"]} if m else None)
        row["backend"] = "llama.cpp (llama-server)"
        return row

    def list(self) -> list[dict]:
        rows, _ = self.s.db.list("chat_profiles", order="updated_at DESC", limit=500)
        return [self._decorate(r) for r in rows]

    def get(self, pid: str) -> dict:
        r = self.s.db.get("chat_profiles", pid)
        if not r:
            raise NotFoundError(f"Profile '{pid}' not found")
        return self._decorate(r)

    def create(self, p: ProfileIn) -> dict:
        p.runtime.validate_types()
        if p.model_id:
            self.s.models.get(p.model_id)
        now = utcnow()
        row = self.s.db.insert("chat_profiles", {
            "id": new_id("prof"), "name": p.name.strip(), "model_id": p.model_id,
            "generation": p.generation.model_dump(), "runtime": p.runtime.model_dump(), "notes": p.notes,
            "created_at": now, "updated_at": now})
        return self._decorate(row)

    def update(self, pid: str, patch: ProfilePatch) -> dict:
        self.get(pid)
        fields: dict = {"updated_at": utcnow()}
        if patch.name is not None:
            fields["name"] = patch.name.strip()
        if patch.model_id is not None:
            self.s.models.get(patch.model_id)
            fields["model_id"] = patch.model_id
        if patch.generation is not None:
            fields["generation"] = patch.generation.model_dump()
        if patch.runtime is not None:
            patch.runtime.validate_types()
            fields["runtime"] = patch.runtime.model_dump()
        if patch.notes is not None:
            fields["notes"] = patch.notes
        return self._decorate(self.s.db.update("chat_profiles", pid, fields))

    def duplicate(self, pid: str, name: str | None = None) -> dict:
        p = self.get(pid)
        return self.create(ProfileIn(name=name or f"{p['name']} (copy)", model_id=p["model_id"],
                                     generation=SamplingParams(**p["generation"]),
                                     runtime=RuntimeConfig(**p["runtime"]), notes=p.get("notes")))

    def delete(self, pid: str) -> None:
        self.get(pid)
        self.s.db.delete("chat_profiles", pid)

    # ------------------------------------------------------------- presets
    def presets(self, model_id: str) -> dict:
        model = self.s.models.get(model_id)
        if not model.get("analysis"):
            raise ValidationFailed("Model has no analysis; re-import it.")
        a = ModelAnalysis.model_validate(model["analysis"])
        snap = self.s.hardware()
        budget = self.s.memory_budget(snap)
        train_ctx = a.architecture.context_length or 4096
        n_layers = a.architecture.n_layers or len(a.layers)

        def build(pid: str, name: str, ctx: int, k: str, v: str, rationale: str, gen: SamplingParams) -> dict:
            ctx = max(256, min(ctx, train_ctx))
            try:
                plan = plan_memory(a, budget, ctx, k, v, flash_attn=True)
            except ValueError as exc:
                return {"id": pid, "name": name, "available": False, "reason": str(exc)}
            rec = plan.recommended
            ngl = rec.n_gpu_layers if rec else 0
            runtime = RuntimeConfig(n_ctx=ctx, n_gpu_layers=min(ngl, n_layers + 1) if rec else 0,
                                    flash_attn="on", cache_type_k=k, cache_type_v=v)
            return {
                "id": pid, "name": name, "available": rec is not None, "rationale": rationale,
                "generation": gen.model_dump(), "runtime": runtime.model_dump(),
                "estimate": ({"vram_bytes": rec.vram_total_bytes, "ram_bytes": rec.ram_total_bytes,
                              "oom_risk": rec.oom_risk, "layers_on_gpu": rec.n_gpu_layers, "basis": "estimated"}
                             if rec else None),
                "reason": None if rec else plan.reason,
            }

        def largest_ctx(k: str, v: str) -> int:
            best = 2048
            for ctx in (4096, 8192, 16384, 32768, 65536, 131072):
                if ctx > train_ctx:
                    break
                try:
                    plan = plan_memory(a, budget, ctx, k, v, flash_attn=True)
                except ValueError:
                    break
                r = plan.recommended
                if r and r.n_gpu_layers >= n_layers and r.oom_risk in ("none", "low", "medium"):
                    best = ctx
            return best

        base = SamplingParams()
        presets = [
            build("max_speed", "Maximum Speed", 4096, "f16", "f16",
                  "Short context, unquantized KV cache, as many layers on GPU as fit.", base),
            build("balanced", "Balanced", 8192, "q8_0", "q8_0",
                  "q8_0 KV cache halves KV memory with usually small quality impact (to be measured).", base),
            build("low_memory", "Low Memory", 2048, "q4_0", "q4_0",
                  "Small context and q4_0 KV cache minimise memory; quality impact must be measured.", base),
            build("max_context", "Maximum Context", largest_ctx("q4_0", "q4_0"), "q4_0", "q4_0",
                  "Largest context whose estimate keeps all layers on GPU, with a q4_0 KV cache.", base),
            build("custom", "Custom", 4096, "f16", "f16", "Editable starting point.", base),
        ]
        return {"model_id": model_id, "hardware": {"accelerator": snap.accelerator,
                                                   "vram_free_bytes": budget.vram_available_bytes,
                                                   "ram_available_bytes": budget.ram_available_bytes,
                                                   "logical_cores": snap.cpu.logical_cores},
                "train_context": train_ctx, "n_layers": n_layers, "presets": presets,
                "note": "Presets are computed starting points; memory figures are estimates, not measurements."}
