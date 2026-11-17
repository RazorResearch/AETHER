"""Speculative decoding: draft/target compatibility checks and llama.cpp flags.

llama.cpp provides speculative decoding (``llama-speculative``, and
``llama-server -md``). AETHER first integrates it as-is: this module checks
whether a draft model is usable with a target model and builds the flags.
Speed-up must be *measured* on the target hardware before being reported.
"""

from __future__ import annotations

from pydantic import BaseModel

from app.core.analyzer import ModelAnalysis


class DraftCompatibility(BaseModel):
    compatible: bool
    reasons: list[str]
    warnings: list[str]
    draft_to_target_param_ratio: float | None
    llamacpp_args: list[str]


def check_draft(target: ModelAnalysis, draft: ModelAnalysis, draft_path: str, draft_max: int = 16,
                draft_min: int = 0, draft_ngl: int = 99) -> DraftCompatibility:
    reasons, warnings = [], []
    tv, dv = target.architecture.vocab_size, draft.architecture.vocab_size
    if tv is None or dv is None:
        warnings.append("vocabulary size unknown for one model; compatibility unverified")
    elif tv != dv:
        # llama.cpp tolerates small vocab differences (SPEC_VOCAB_MAX_SIZE_DIFFERENCE=128)
        if abs(tv - dv) > 128:
            reasons.append(f"vocabulary sizes differ too much ({tv} vs {dv})")
        else:
            warnings.append(f"vocabulary sizes differ slightly ({tv} vs {dv}); llama.cpp checks token text")
    tt = target.metadata.get("tokenizer.ggml.model")
    dt = draft.metadata.get("tokenizer.ggml.model")
    if tt and dt and tt != dt:
        reasons.append(f"different tokenizer families ({tt} vs {dt})")
    ratio = (draft.n_params / target.n_params) if target.n_params and draft.n_params else None
    if ratio is not None and ratio > 0.5:
        warnings.append(f"draft is {ratio:.0%} of target size: speed-up unlikely")
    args = ["-md", draft_path, "--draft-max", str(draft_max), "--draft-min", str(draft_min),
            "-ngld", str(draft_ngl)]
    return DraftCompatibility(compatible=not reasons, reasons=reasons, warnings=warnings,
                              draft_to_target_param_ratio=ratio, llamacpp_args=args)
