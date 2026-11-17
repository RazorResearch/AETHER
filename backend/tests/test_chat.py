"""Chat, live metrics, profiles and configuration comparison (fake llama-server)."""

import json
import threading
import time

import pytest

from app.engines.llama_server import LlamaServerRuntime, RuntimeConfig
from tests.helpers import fake_binaries, make_llama_gguf

V = "/api/v1"


@pytest.fixture
def chat_client(client_llama):
    """client_llama has fake llama.cpp tools; add the fake llama-server to the chat runtime."""
    s = client_llama.services
    s.chat_runtime = LlamaServerRuntime(fake_binaries(("llama-server",))["llama-server"], load_timeout_s=30)
    s._singletons.clear()
    yield client_llama
    s.chat_runtime.shutdown()


def _model(c, path):
    r = c.post(f"{V}/models/import", json={"path": str(path)})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _stream(c, body):
    events, ev = [], None
    with c.stream("POST", f"{V}/chat/generate", json=body) as r:
        if r.status_code != 200:
            r.read()
            return r.status_code, r.json()
        for line in r.iter_lines():
            if line.startswith("event:"):
                ev = line[6:].strip()
            elif line.startswith("data:") and ev:
                events.append((ev, json.loads(line[5:])))
    return 200, events


def test_parse_placement_from_real_log_lines():
    lines = [
        "0.00.356 I llama_prepare_model_devices: using device CUDA0 (NVIDIA GeForce RTX 5060) (0000:01:00.0) - 7031 MiB free",
        "0.00.501 I load_tensors: offloaded 20/29 layers to GPU",
        "0.00.501 I load_tensors:   CPU_Mapped model buffer size =   182.39 MiB",
        "0.00.501 I load_tensors:   CPU_Mapped model buffer size =    25.12 MiB",
        "0.00.501 I load_tensors:        CUDA0 model buffer size =   687.73 MiB",
        "0.00.765 I llama_kv_cache:        CPU KV buffer size =    18.00 MiB",
    ]
    p = LlamaServerRuntime._parse_placement(lines)
    assert (p.layers_on_gpu, p.layers_total) == (20, 29)
    assert p.buffers_mib["CPU_Mapped"]["model"] == pytest.approx(207.51)
    assert p.buffers_mib["CUDA0"]["model"] == 687.73 and p.buffers_mib["CPU"]["KV"] == 18.0
    assert p.device.startswith("CUDA0")


def test_runtime_config_validation():
    from app.core.errors import ValidationFailed

    with pytest.raises(ValidationFailed):
        RuntimeConfig(cache_type_v="q4_0", flash_attn="off").validate_types()
    with pytest.raises(ValidationFailed):
        RuntimeConfig(cache_type_k="q3_k").validate_types()
    with pytest.raises(ValidationFailed):
        RuntimeConfig(n_batch=256, n_ubatch=512).validate_types()


def test_chat_models_lists_loadable_models(chat_client, tiny_gguf):
    mid = _model(chat_client, tiny_gguf)
    r = chat_client.get(f"{V}/chat/models").json()
    m = next(x for x in r["items"] if x["id"] == mid)
    assert m["loadable"] and m["state"] == "unloaded" and m["format"] == "gguf"
    assert r["backend"]["available"] and "q8_0" in r["backend"]["kv_cache_types"]


def test_chat_unavailable_without_llama_server(client, tiny_gguf):
    mid = _model(client, tiny_gguf)
    code, body = _stream(client, {"model_id": mid, "content": "hi"})
    assert code == 503 and body["error"]["code"] == "ENGINE_UNAVAILABLE"
    m = client.get(f"{V}/chat/models").json()["items"][0]
    assert not m["loadable"] and m["unavailable_reason"]


def test_generate_streams_tokens_and_metrics(chat_client, tiny_gguf):
    mid = _model(chat_client, tiny_gguf)
    code, events = _stream(chat_client, {"model_id": mid, "content": "Hello there",
                                         "generation": {"max_tokens": 40, "seed": 7},
                                         "runtime": {"n_ctx": 512, "n_gpu_layers": 99}})
    assert code == 200
    kinds = [e for e, _ in events]
    assert kinds[0] == "session" and "token" in kinds and kinds[-1] == "done"
    assert kinds.count("token") == 40
    states = [d["state"] for e, d in events if e == "status"]
    assert states == ["loading", "generating"]
    gen_status = next(d for e, d in events if e == "status" and d["state"] == "generating")
    assert gen_status["placement"]["layers_on_gpu"] == 3 and gen_status["placement"]["layers_total"] == 3
    done = events[-1][1]
    m = done["metrics"]
    assert done["message"]["status"] == "complete" and done["message"]["content"].startswith("The quick")
    assert m["wall"]["ttft_ms"] > 0 and m["wall"]["tpot_ms"] > 0 and m["wall"]["streamed_chunks"] == 40
    assert m["engine"]["completion_tokens"] == 40 and m["engine"]["tokens_per_s"] > 0
    assert m["engine"]["prompt_tokens"] == 2
    assert m["hardware"]["samples"] >= 1 and m["hardware"]["peak_proc_rss_bytes"] > 0
    assert m["runtime"]["n_ctx"] == 512 and m["generation_params"]["seed"] == 7
    assert m["model"]["id"] == mid and m["measured_at"]
    # persisted
    sid = done["message"]["session_id"]
    s = chat_client.get(f"{V}/chat/sessions/{sid}").json()
    assert [x["role"] for x in s["messages"]] == ["user", "assistant"]
    assert s["messages"][1]["metrics"]["wall"]["streamed_chunks"] == 40
    # model now resident: second generation must not reload
    code, events = _stream(chat_client, {"model_id": mid, "session_id": sid, "content": "again",
                                         "generation": {"max_tokens": 3}, "runtime": {"n_ctx": 512}})
    assert [d["state"] for e, d in events if e == "status"] == ["generating"]
    hist = chat_client.get(f"{V}/chat/performance", params={"model_id": mid}).json()
    assert len(hist) == 2 and "timeline" not in hist[0]["metrics"]


def test_stop_really_stops(chat_client, tiny_gguf):
    mid = _model(chat_client, tiny_gguf)
    _stream(chat_client, {"model_id": mid, "content": "warm", "generation": {"max_tokens": 1}})  # load first

    def stopper():
        time.sleep(0.4)
        chat_client.post(f"{V}/chat/stop", json={})

    threading.Thread(target=stopper).start()
    t0 = time.time()
    code, events = _stream(chat_client, {"model_id": mid, "content": "long", "generation": {"max_tokens": 5000}})
    elapsed = time.time() - t0
    done = events[-1][1]
    n = sum(1 for e, _ in events if e == "token")
    assert done["message"]["status"] == "stopped" and 0 < n < 5000 and elapsed < 10
    assert chat_client.get(f"{V}/chat/metrics").json()["generation"] is None
    assert chat_client.post(f"{V}/chat/stop", json={}).json()["stopped"] is False


def test_regenerate_edit_rename_delete(chat_client, tiny_gguf):
    mid = _model(chat_client, tiny_gguf)
    _, ev = _stream(chat_client, {"model_id": mid, "content": "first question", "generation": {"max_tokens": 3}})
    sid = ev[-1][1]["message"]["session_id"]
    _, ev = _stream(chat_client, {"model_id": mid, "session_id": sid, "regenerate": True, "generation": {"max_tokens": 5}})
    s = chat_client.get(f"{V}/chat/sessions/{sid}").json()
    assert [m["role"] for m in s["messages"]] == ["user", "assistant"]
    assert len(s["messages"][1]["content"].split()) == 5
    user_id = s["messages"][0]["id"]
    _stream(chat_client, {"model_id": mid, "session_id": sid, "edit_message_id": user_id,
                          "content": "edited question", "generation": {"max_tokens": 2}})
    s = chat_client.get(f"{V}/chat/sessions/{sid}").json()
    assert [(m["role"], m["content"].strip()) for m in s["messages"]][0] == ("user", "edited question")
    assert len(s["messages"]) == 2
    assert chat_client.patch(f"{V}/chat/sessions/{sid}", json={"title": "Renamed"}).json()["title"] == "Renamed"
    assert chat_client.get(f"{V}/chat/sessions").json()["items"][0]["message_count"] == 2
    assert chat_client.delete(f"{V}/chat/sessions/{sid}").status_code == 204
    assert chat_client.get(f"{V}/chat/sessions/{sid}").status_code == 404


def test_generate_validation(chat_client, tiny_gguf):
    mid = _model(chat_client, tiny_gguf)
    code, body = _stream(chat_client, {"model_id": mid, "content": "x", "runtime": {"n_ctx": 999_999}})
    assert code == 422 and "training context" in body["error"]["message"]
    code, body = _stream(chat_client, {"model_id": mid, "content": "x",
                                       "runtime": {"cache_type_v": "q4_0", "flash_attn": "off"}})
    assert code == 422
    code, body = _stream(chat_client, {"model_id": mid})
    assert code == 422
    code, body = _stream(chat_client, {"model_id": mid, "content": "x", "runtime": {"n_threads": 100000}})
    assert code == 422


def test_model_load_failure_is_reported(chat_client, tmp_path):
    p = make_llama_gguf(tmp_path / "FAILLOAD.gguf")
    mid = _model(chat_client, p)
    code, events = _stream(chat_client, {"model_id": mid, "content": "hi"})
    assert code == 200
    err = next(d for e, d in events if e == "error")
    assert err["code"] == "MODEL_LOAD_FAILED" and "corrupted" in err["details"]["log_tail"]
    assert events[-1][1]["message"]["status"] == "error"


def test_runtime_load_unload_endpoints(chat_client, tiny_gguf):
    mid = _model(chat_client, tiny_gguf)
    st = chat_client.post(f"{V}/chat/runtime/load", json={"model_id": mid, "runtime": {"n_gpu_layers": 1}}).json()
    assert st["state"] == "ready" and st["placement"]["layers_on_gpu"] == 1 and st["build_info"] == "b9999-deadbee"
    assert chat_client.get(f"{V}/chat/models").json()["items"][0]["state"] == "ready"
    assert chat_client.post(f"{V}/chat/runtime/unload").json()["state"] == "unloaded"


def test_profiles_crud_and_presets(chat_client, tiny_gguf):
    mid = _model(chat_client, tiny_gguf)
    p = chat_client.post(f"{V}/chat/profiles", json={"name": "Fast", "model_id": mid,
                                                     "runtime": {"cache_type_k": "q8_0", "cache_type_v": "q8_0"}}).json()
    assert p["model"]["id"] == mid and p["runtime"]["cache_type_k"] == "q8_0"
    d = chat_client.post(f"{V}/chat/profiles/{p['id']}/duplicate").json()
    assert d["name"] == "Fast (copy)" and d["id"] != p["id"]
    r = chat_client.patch(f"{V}/chat/profiles/{d['id']}", json={"name": "Renamed", "generation": {"temperature": 0.2}}).json()
    assert r["name"] == "Renamed" and r["generation"]["temperature"] == 0.2
    assert len(chat_client.get(f"{V}/chat/profiles").json()) == 2
    assert chat_client.delete(f"{V}/chat/profiles/{d['id']}").status_code == 204
    bad = chat_client.post(f"{V}/chat/profiles", json={"name": "x", "runtime": {"cache_type_v": "q4_0", "flash_attn": "off"}})
    assert bad.status_code == 422
    pr = chat_client.get(f"{V}/chat/presets", params={"model_id": mid}).json()
    ids = [x["id"] for x in pr["presets"]]
    assert ids == ["max_speed", "balanced", "low_memory", "max_context", "custom"]
    assert all(x["runtime"]["n_ctx"] <= pr["train_context"] for x in pr["presets"] if x["available"])
    assert pr["presets"][0]["estimate"]["basis"] == "estimated"


def test_compare_configurations(chat_client, tiny_gguf):
    mid = _model(chat_client, tiny_gguf)
    body = {"prompt": "Say something", "generation": {"max_tokens": 20, "temperature": 0, "seed": 1},
            "configs": [{"label": "A", "model_id": mid, "runtime": {"n_gpu_layers": 99, "cache_type_k": "f16"}},
                        {"label": "B", "model_id": mid, "runtime": {"n_gpu_layers": 1, "cache_type_k": "q8_0",
                                                                     "cache_type_v": "q8_0", "flash_attn": "on"}}],
            "warmup_runs": 1, "repetitions": 3}
    r = chat_client.post(f"{V}/chat/compare", json=body)
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONFIRMATION_REQUIRED"
    r = chat_client.post(f"{V}/chat/compare", json={**body, "confirm": True})
    assert r.status_code == 202, r.text
    cmp = r.json()
    chat_client.services.jobs.wait(cmp["job_id"], 120)
    res = chat_client.get(f"{V}/chat/compare/{cmp['id']}").json()
    assert res["status"] == "completed", res
    out = res["results"]
    a, b = out["configs"]
    assert len(a["runs"]) == 3 and a["stats"]["gen_tokens_per_s"]["n"] == 3
    assert a["placement"]["layers_on_gpu"] == 3 and b["placement"]["layers_on_gpu"] == 1
    assert a["deterministic_output"] and a["output_sample"]
    comp = out["comparison"]["gen_tokens_per_s"]
    assert comp["reference"] == "A" and comp["best"] in ("A", "B") and "percent" in comp["vs_reference"]["B"]
    assert out["quality"]["evaluated"] is False
    assert any("GPU only" in n for n in out["notes"])
    assert chat_client.get(f"{V}/chat/compare").json()[0]["id"] == cmp["id"]
    bad = chat_client.post(f"{V}/chat/compare", json={**body, "confirm": True,
                                                       "configs": [body["configs"][0], body["configs"][0]]})
    assert bad.status_code == 422
