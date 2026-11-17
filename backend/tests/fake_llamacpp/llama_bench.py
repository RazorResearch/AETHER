"""Fake llama-bench emitting the JSON schema of the real tool (``-o json``)."""
import json
import sys
import time

args = sys.argv[1:]
if "--version" in args:
    print("version: 9999 (deadbee)\nbuilt with fake compiler", file=sys.stderr)
    sys.exit(0)
if any(a.endswith("FAILME.gguf") for a in args):
    print("error: failed to load model", file=sys.stderr)
    sys.exit(1)


def arg(flag, default):
    return args[args.index(flag) + 1] if flag in args else default


n_p, n_g, reps = int(arg("-p", 512)), int(arg("-n", 128)), int(arg("-r", 5))
ctk = arg("-ctk", "f16")
time.sleep(0.15)  # let the resource monitor sample
base = {"build_commit": "deadbee", "build_number": 9999, "model_filename": arg("-m", "?"),
        "n_gpu_layers": int(arg("-ngl", 99)), "type_k": ctk, "type_v": arg("-ctv", "f16")}
speed = {"f16": 1.0, "q8_0": 1.05, "q4_0": 1.1}.get(ctk, 1.0)
pp = [1000.0 * speed + i for i in range(reps)]
tg = [50.0 * speed + 0.1 * i for i in range(reps)]
rows = [
    {**base, "n_prompt": n_p, "n_gen": 0, "avg_ts": sum(pp) / reps, "stddev_ts": 1.58, "samples_ts": pp},
    {**base, "n_prompt": 0, "n_gen": n_g, "avg_ts": sum(tg) / reps, "stddev_ts": 0.158, "samples_ts": tg},
]
print(json.dumps(rows, indent=2))
