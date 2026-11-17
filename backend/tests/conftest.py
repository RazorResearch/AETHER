from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import load_settings
from app.engines.llamacpp import LlamaCppEngine
from app.main import create_app
from app.services.container import Services
from tests.helpers import fake_binaries, fake_hardware, make_llama_gguf


@pytest.fixture
def settings(tmp_path: Path):
    return load_settings(data_dir=tmp_path / "data", db_path=tmp_path / "data" / "aether.db",
                         model_dirs=(tmp_path / "models",), llamacpp_dir=None)


@pytest.fixture
def tiny_gguf(tmp_path: Path) -> Path:
    d = tmp_path / "models"
    d.mkdir(exist_ok=True)
    return make_llama_gguf(d / "tiny-f16.gguf")


def _services(settings, llama: bool, gpu: bool) -> Services:
    engine = LlamaCppEngine(binaries=fake_binaries() if llama else {}, timeout_s=60)
    return Services(settings, llamacpp=engine, hardware_provider=lambda: fake_hardware(gpu=gpu))


@pytest.fixture
def services_cpu(settings):
    s = _services(settings, llama=False, gpu=False)
    yield s
    s.shutdown()


@pytest.fixture
def client(settings):
    """API client: CPU-only machine, no llama.cpp installed."""
    s = _services(settings, llama=False, gpu=False)
    with TestClient(create_app(services=s)) as c:
        c.services = s
        yield c


@pytest.fixture
def client_llama(settings):
    """API client: GPU machine with (fake) llama.cpp tools."""
    s = _services(settings, llama=True, gpu=True)
    with TestClient(create_app(services=s)) as c:
        c.services = s
        yield c


def real_gguf() -> Path | None:
    p = os.environ.get("AETHER_TEST_GGUF")
    return Path(p) if p and Path(p).is_file() else None
