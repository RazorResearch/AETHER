"""Fake llama-server speaking the real protocol subset AETHER uses.

/health (503 while "loading", then 200), /props, and streamed
/v1/chat/completions with OpenAI-style chunks and a final `timings` object.
Stops streaming when the client disconnects, like the real server.
Model files whose name contains "FAILLOAD" make the process exit during load.
"""
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

args = sys.argv[1:]


def arg(flag, default=None):
    return args[args.index(flag) + 1] if flag in args else default


port = int(arg("--port", 9931))
model = arg("-m", "model.gguf")
ngl = int(arg("-ngl", 99))
print(f"I srv    load_model: loading model '{model}'", flush=True)
if "FAILLOAD" in model:
    print("E llama_model_load: error loading model: corrupted file", flush=True)
    sys.exit(1)
layers = 2
on_gpu = min(ngl, layers + 1)
print("I llama_prepare_model_devices: using device CUDA0 (Fake GPU) (0000:01:00.0) - 7000 MiB free", flush=True)
print(f"I load_tensors: offloaded {on_gpu}/{layers + 1} layers to GPU", flush=True)
print("I load_tensors:        CUDA0 model buffer size =   100.50 MiB", flush=True)
print("I load_tensors:   CPU_Mapped model buffer size =    10.00 MiB", flush=True)
print("I llama_kv_cache:      CUDA0 KV buffer size =    16.00 MiB", flush=True)
ready_at = time.time() + 0.3
LOG = model + ".requests.jsonl"
WORDS = ("The quick brown fox jumps over the lazy dog . " * 200).split()


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            if time.time() < ready_at:
                return self._json(503, {"error": {"message": "Loading model"}})
            return self._json(200, {"status": "ok"})
        if self.path == "/props":
            return self._json(200, {"build_info": "b9999-deadbee", "model_path": model, "total_slots": 1})
        self._json(404, {"error": "not found"})

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        req = json.loads(self.rfile.read(n) or b"{}")
        if self.path != "/v1/chat/completions":
            return self._json(404, {"error": "not found"})
        max_tokens = int(req.get("max_tokens", 16))
        prompt_tokens = sum(len(m["content"].split()) for m in req["messages"])
        with open(LOG, "a") as fh:
            fh.write(json.dumps({"cache_prompt": req.get("cache_prompt")}) + "\n")
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        t0 = time.perf_counter()
        sent = 0
        try:
            time.sleep(0.02)  # "prefill"
            t_pp = time.perf_counter()
            for i in range(max_tokens):
                chunk = {"choices": [{"delta": {"content": WORDS[i % len(WORDS)] + " "}, "finish_reason": None}]}
                self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
                self.wfile.flush()
                sent += 1
                time.sleep(0.005)
            t_end = time.perf_counter()
            pp_ms, gen_ms = (t_pp - t0) * 1000, (t_end - t_pp) * 1000
            final = {"choices": [{"delta": {}, "finish_reason": "length"}]}
            self.wfile.write(f"data: {json.dumps(final)}\n\n".encode())
            usage = {"choices": [], "usage": {"prompt_tokens": prompt_tokens, "completion_tokens": sent},
                     "timings": {"cache_n": 0, "prompt_n": prompt_tokens, "prompt_ms": pp_ms,
                                 "prompt_per_second": prompt_tokens / (pp_ms / 1000),
                                 "predicted_n": sent, "predicted_ms": gen_ms,
                                 "predicted_per_token_ms": gen_ms / max(sent, 1),
                                 "predicted_per_second": sent / (gen_ms / 1000)}}
            self.wfile.write(f"data: {json.dumps(usage)}\n\ndata: [DONE]\n\n".encode())
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            print(f"I srv  stop: client disconnected after {sent} tokens", flush=True)


srv = ThreadingHTTPServer(("127.0.0.1", port), H)
print(f"I srv  server_on_li: listening on http://127.0.0.1:{port}", flush=True)
threading.Thread(target=srv.serve_forever, daemon=True).start()
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    pass
