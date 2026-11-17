"""Command-line entry point: ``python -m app.cli serve|hardware|analyze``."""

from __future__ import annotations

import argparse
import json
import sys


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="aether-engine")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("serve", help="run the REST API")
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--port", type=int, default=8765)
    sub.add_parser("hardware", help="print the hardware snapshot as JSON")
    a = sub.add_parser("analyze", help="analyze a model file")
    a.add_argument("path")
    a.add_argument("--tensors", action="store_true")
    args = p.parse_args(argv)

    if args.cmd == "serve":
        import uvicorn

        uvicorn.run("app.main:app", host=args.host, port=args.port)
    elif args.cmd == "hardware":
        from app.core.hardware import collect_hardware

        print(collect_hardware().model_dump_json(indent=2))
    elif args.cmd == "analyze":
        from app.core.analyzer import analyze_model

        res = analyze_model(args.path, include_tensors=args.tensors).model_dump(mode="json")
        res.pop("metadata", None) if not args.tensors else None
        json.dump(res, sys.stdout, indent=2)
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
