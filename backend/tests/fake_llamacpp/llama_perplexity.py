"""Fake llama-perplexity printing the real tool's final line."""
import sys
import time

time.sleep(0.05)
args = sys.argv[1:]
ctk = args[args.index("-ctk") + 1] if "-ctk" in args else "f16"
ppl = {"f16": 10.0, "q8_0": 10.02, "q4_0": 10.3}.get(ctk, 10.0)
print("perplexity: calculating perplexity over 4 chunks", file=sys.stderr)
print(f"Final estimate: PPL = {ppl:.4f} +/- 0.12345", file=sys.stderr)
