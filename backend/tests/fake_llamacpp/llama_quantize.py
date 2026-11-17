"""Fake llama-quantize: copies the source file to the destination (positional args: src dst TYPE)."""
import shutil
import sys

args = sys.argv[1:]
pos = []
i = 0
while i < len(args):
    if args[i].startswith("--"):
        i += 2
        continue
    pos.append(args[i])
    i += 1
src, dst = pos[0], pos[1]
shutil.copyfile(src, dst)
print(f"quantized {src} -> {dst} as {pos[2]}")
