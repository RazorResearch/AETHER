"""API integration tests (contract checks against docs/API_CONTRACT.md)."""

from tests.helpers import make_llama_gguf

V = "/api/v1"


def _import(c, path):
    r = c.post(f"{V}/models/import", json={"path": str(path)})
    assert r.status_code == 201, r.text
    return r.json()


def _wait(c, job_id):
    c.services.jobs.wait(job_id, 60)
    return c.get(f"{V}/optimization/{job_id}").json()


def test_health_and_hardware_cpu_mode(client):
    h = client.get(f"{V}/system/health").json()
    assert h["status"] == "ok" and h["schema_version"] == 1
    assert h["config"]["max_concurrent_jobs"] == 1 and h["config"]["data_dir"]
    assert {e["name"] for e in h["engines"]} == {"llama.cpp", "pytorch"}
    hw = client.get(f"{V}/system/hardware").json()
    assert hw["accelerator"] == "cpu" and hw["gpus"] == []


def test_model_lifecycle(client, tiny_gguf):
    m = _import(client, tiny_gguf)
    assert m["id"].startswith("mdl_") and m["format"] == "gguf" and m["architecture"] == "llama"
    assert m["analysis"]["architecture"]["n_layers"] == 2
    lst = client.get(f"{V}/models").json()
    assert lst["total"] == 1 and "analysis" not in lst["items"][0]
    assert client.get(f"{V}/models/{m['id']}").json()["quantization"] == "F16"
    t = client.get(f"{V}/models/{m['id']}/analysis", params={"include_tensors": True}).json()
    assert t["layers"][0]["tensors"]
    dup = client.post(f"{V}/models/import", json={"path": str(tiny_gguf)})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "MODEL_ALREADY_EXISTS"
    assert client.delete(f"{V}/models/{m['id']}").status_code == 204
    assert tiny_gguf.exists(), "removing from library must never delete the file"
    assert client.get(f"{V}/models/{m['id']}").status_code == 404


def test_model_import_errors(client, tmp_path):
    r = client.post(f"{V}/models/import", json={"path": str(tmp_path / "missing.gguf")})
    assert r.status_code == 404 and r.json()["error"]["code"] == "FILE_NOT_FOUND"
    junk = tmp_path / "junk.gguf"
    junk.write_bytes(b"definitely not gguf")
    r = client.post(f"{V}/models/import", json={"path": str(junk)})
    assert r.status_code == 415 and r.json()["error"]["code"] == "UNSUPPORTED_FORMAT"
    r = client.post(f"{V}/models/import", json={"path": "relative.gguf"})
    assert r.status_code == 422
    r = client.post(f"{V}/models/import", json={})
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_model_scan_and_missing_status(client, tmp_path):
    d = tmp_path / "models"
    d.mkdir(exist_ok=True)
    make_llama_gguf(d / "a.gguf")
    make_llama_gguf(d / "b.gguf", seed=1)
    res = client.post(f"{V}/models/scan", json={"directories": [str(d)]}).json()
    assert len(res["imported"]) == 2 and not res["errors"]
    again = client.post(f"{V}/models/scan", json={"directories": [str(d)]}).json()
    assert len(again["skipped"]) == 2
    mid = res["imported"][0]["id"]
    (d / "a.gguf").unlink() if res["imported"][0]["path"].endswith("a.gguf") else (d / "b.gguf").unlink()
    assert client.get(f"{V}/models/{mid}").json()["status"] == "missing"


def test_benchmark_unavailable_without_llamacpp(client, tiny_gguf):
    m = _import(client, tiny_gguf)
    r = client.post(f"{V}/benchmarks", json={"model_id": m["id"]})
    assert r.status_code == 503 and r.json()["error"]["code"] == "ENGINE_UNAVAILABLE"


def test_benchmark_with_llamacpp(client_llama, tiny_gguf, tmp_path):
    c = client_llama
    m = _import(c, tiny_gguf)
    ds = tmp_path / "eval.txt"
    ds.write_text("lorem ipsum " * 200)
    r = c.post(f"{V}/benchmarks", json={"model_id": m["id"], "params": {"repetitions": 3},
                                        "perplexity_dataset": str(ds)})
    assert r.status_code == 202, r.text
    b = r.json()
    assert b["status"] in ("queued", "running", "completed") and b["job_id"]
    c.services.jobs.wait(b["job_id"], 60)
    b = c.get(f"{V}/benchmarks/{b['id']}").json()
    assert b["status"] == "completed", b
    rec = b["record"]
    # reproducibility fields required by the spec
    for key in ("model", "engine", "engine_version", "hardware_fingerprint", "params", "created_at"):
        assert rec[key] is not None
    assert rec["model"]["fingerprint"] and rec["model"]["quantization"] == "F16"
    assert rec["params"]["repetitions"] == 3 and rec["gen_tps"]["n"] == 3
    assert rec["quality"]["perplexity"]["perplexity"] == 10.0
    cmp = c.get(f"{V}/benchmarks/compare", params={"a": b["id"], "b": b["id"]}).json()
    assert cmp == {"comparable": True, "issues": []}


def test_experiment_sensitivity_flow(client, tiny_gguf):
    m = _import(client, tiny_gguf)
    types = {t["id"]: t for t in client.get(f"{V}/experiments/types").json()}
    assert types["quantization_sensitivity"]["cost"] == "moderate"
    r = client.post(f"{V}/experiments", json={"name": "EXP-001 tiny", "type": "quantization_sensitivity",
                                              "hypothesis": "layers differ in sensitivity",
                                              "config": {"model_id": m["id"], "budgets_bits_per_weight": [4.5]}})
    assert r.status_code == 201, r.text
    e = r.json()
    assert e["status"] == "draft"
    s = client.post(f"{V}/experiments/{e['id']}/start")
    assert s.status_code == 202 and s.json()["status"] in ("queued", "running", "completed")
    client.services.jobs.wait(s.json()["job_id"], 60)
    e = client.get(f"{V}/experiments/{e['id']}").json()
    assert e["status"] == "completed" and e["result"]["validated"] is False
    assert e["job"]["status"] == "completed"
    assert client.get(f"{V}/experiments", params={"status": "completed"}).json()["total"] == 1
    assert client.delete(f"{V}/experiments/{e['id']}").status_code == 204
    assert client.get(f"{V}/experiments/{e['id']}").status_code == 404


def test_experiment_validation_and_confirmation(client_llama, tiny_gguf):
    c = client_llama
    m = _import(c, tiny_gguf)
    bad = c.post(f"{V}/experiments", json={"name": "x", "type": "nope", "config": {}})
    assert bad.status_code == 422
    bad_kv = c.post(f"{V}/experiments", json={"name": "x", "type": "kv_cache_comparison",
                                              "config": {"model_id": m["id"], "pairs": [["f16", "q3"]]}})
    assert bad_kv.status_code == 422
    e = c.post(f"{V}/experiments", json={"name": "kv", "type": "kv_cache_comparison",
                                         "config": {"model_id": m["id"], "repetitions": 1}}).json()
    r = c.post(f"{V}/experiments/{e['id']}/start", json={})
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONFIRMATION_REQUIRED"
    r = c.post(f"{V}/experiments/{e['id']}/start", json={"confirm": True})
    assert r.status_code == 202
    c.services.jobs.wait(r.json()["job_id"], 60)
    e = c.get(f"{V}/experiments/{e['id']}").json()
    assert e["status"] == "completed", e
    assert len(e["result"]["rows"]) == 3
    assert c.get(f"{V}/benchmarks", params={"experiment_id": e["id"]}).json()["total"] == 3


def test_quantization_comparison_with_fake_tools(client_llama, tiny_gguf, tmp_path):
    c = client_llama
    m = _import(c, tiny_gguf)
    e = c.post(f"{V}/experiments", json={"name": "q", "type": "quantization_comparison", "config": {
        "model_id": m["id"], "presets": ["Q4_K_M"], "output_dir": str(tmp_path / "out"), "repetitions": 1}}).json()
    r = c.post(f"{V}/experiments/{e['id']}/start", json={"confirm": True})
    c.services.jobs.wait(r.json()["job_id"], 60)
    e = c.get(f"{V}/experiments/{e['id']}").json()
    assert e["status"] == "completed", e
    assert e["result"]["validated"] is False  # no perplexity dataset => quality not measured
    assert (tmp_path / "out" / "tiny-f16.Q4_K_M.gguf").exists()


def test_optimization_flow_estimate_only(client, tiny_gguf):
    m = _import(client, tiny_gguf)
    profiles = client.get(f"{V}/optimization/profiles").json()
    assert {p["id"] for p in profiles} == {"maximum_intelligence", "balanced", "minimum_memory",
                                           "maximum_speed", "custom"}
    est = client.post(f"{V}/optimization/estimate", json={"model_id": m["id"], "n_ctx": 2048}).json()
    assert est["is_estimate"] and est["memory_plan"]["recommended"]["n_gpu_layers"] == 0  # CPU machine
    job = client.post(f"{V}/optimization/start", json={"model_id": m["id"], "profile": "balanced"})
    assert job.status_code == 202
    j = _wait(client, job.json()["id"])
    assert j["status"] == "completed"
    res = client.get(f"{V}/optimization/{j['id']}/results").json()["result"]
    assert res["outcome"] == "estimated_only"
    assert res["optimization_applied"] is False and res["validated"] is False
    assert res["recommended"] is not None


def test_optimization_measure_requires_confirm_and_engine(client, client_llama, tiny_gguf):
    m = _import(client, tiny_gguf)
    r = client.post(f"{V}/optimization/start", json={"model_id": m["id"], "measure": True})
    assert r.status_code == 409
    r = client.post(f"{V}/optimization/start", json={"model_id": m["id"], "measure": True, "confirm": True})
    assert r.status_code == 503


def test_optimization_measured(client_llama, tiny_gguf, tmp_path):
    c = client_llama
    m = _import(c, tiny_gguf)
    ds = tmp_path / "eval.txt"
    ds.write_text("x " * 100)
    r = c.post(f"{V}/optimization/start", json={"model_id": m["id"], "profile": "maximum_speed", "measure": True,
                                                "confirm": True, "repetitions": 1, "perplexity_dataset": str(ds)})
    j = _wait(c, r.json()["id"])
    assert j["status"] == "completed", j
    res = c.get(f"{V}/optimization/{j['id']}/results").json()["result"]
    assert res["outcome"] == "measured"
    best = res["recommended"]
    assert best["metrics"]["speed"]["basis"] == "measured"
    assert best["config"]["cache_type_k"] == "q4_0"  # fake bench is fastest with q4_0


def test_activity_and_error_envelope(client, tiny_gguf):
    _import(client, tiny_gguf)
    a = client.get(f"{V}/activity", params={"category": "model"}).json()
    assert a["total"] >= 1 and a["items"][0]["type"] == "model.imported"
    r = client.get(f"{V}/optimization/job_unknown")
    assert r.status_code == 404 and set(r.json()["error"]) == {"code", "message", "details"}
    r = client.get(f"{V}/does-not-exist")
    assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"


def test_openapi_lists_contract_endpoints(client):
    paths = client.get(f"{V}/openapi.json").json()["paths"]
    for p in ["/system/hardware", "/models", "/models/import", "/models/{model_id}", "/experiments",
              "/experiments/{experiment_id}", "/experiments/{experiment_id}/start", "/benchmarks", "/activity",
              "/optimization/profiles", "/optimization/estimate", "/optimization/start",
              "/optimization/{job_id}", "/optimization/{job_id}/results"]:
        assert V + p in paths, p
