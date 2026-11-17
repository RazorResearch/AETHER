"""Fake llama-imatrix: writes an empty output file."""
import sys

args = sys.argv[1:]
open(args[args.index("-o") + 1], "wb").close()
