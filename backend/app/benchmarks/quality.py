"""Quality evaluators.

* ``PerplexityEvaluator`` — llama.cpp ``llama-perplexity`` on a local text file.
* ``LmEvalHarnessEvaluator`` — adapter for EleutherAI lm-evaluation-harness
  (MIT). Task datasets (GSM8K, ARC, MMLU...) are fetched by the harness itself
  from their upstream sources under their own licences; AETHER never bundles
  them and only runs the harness when the user starts a benchmark explicitly.
  Status: availability detection + command construction. Execution against a
  ``llama-server`` endpoint is planned (see docs/ROADMAP.md).
"""

from __future__ import annotations

import importlib.util
import shutil

from app.core.errors import EngineUnavailableError, FeatureNotImplemented

# Licences recorded alongside results (verify before publication).
TASK_LICENSES = {
    "gsm8k": "MIT (openai/grade-school-math)",
    "arc_easy": "CC BY-SA 4.0 (allenai/ai2_arc)",
    "arc_challenge": "CC BY-SA 4.0 (allenai/ai2_arc)",
    "mmlu": "MIT (hendrycks/test)",
    "hellaswag": "MIT",
    "humaneval": "MIT (openai/human-eval) - executes generated code: sandbox required",
}


class LmEvalHarnessEvaluator:
    name = "lm-evaluation-harness"

    def available(self) -> bool:
        return importlib.util.find_spec("lm_eval") is not None or shutil.which("lm_eval") is not None

    def build_command(self, base_url: str, tasks: list[str], limit: int | None = None,
                      num_fewshot: int | None = None) -> list[str]:
        unknown = [t for t in tasks if t not in TASK_LICENSES]
        if unknown:
            raise ValueError(f"tasks without recorded licence: {unknown}")
        cmd = ["lm_eval", "--model", "local-completions", "--tasks", ",".join(tasks),
               "--model_args", f"base_url={base_url}/v1/completions,tokenizer_backend=None"]
        if limit:
            cmd += ["--limit", str(limit)]
        if num_fewshot is not None:
            cmd += ["--num_fewshot", str(num_fewshot)]
        return cmd

    def run(self, *_, **__):
        if not self.available():
            raise EngineUnavailableError("lm-evaluation-harness is not installed (pip install lm-eval).")
        raise FeatureNotImplemented("lm-evaluation-harness execution is not wired yet (requires llama-server "
                                    "lifecycle management). Use perplexity for now.")
