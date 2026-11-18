from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from pianola.api.settings import Settings
from pianola.api.wiring import create_production_app


def test_settings_defaults_are_safe() -> None:
    settings = Settings.from_env({})
    assert settings.proxy_url is None
    assert settings.trust_proxy is False
    assert settings.max_duration_s == 600.0
    assert settings.work_dir is None


def test_settings_read_the_environment() -> None:
    settings = Settings.from_env(
        {
            "PIANOLA_BYTEDANCE_CHECKPOINT": "/m/c.pth",
            "PIANOLA_WORK_DIR": "/data/work",
            "PIANOLA_PROXY_URL": "socks5h://10.8.0.2:1080",
            "PIANOLA_MAX_DURATION_SECONDS": "300",
            "PIANOLA_DEVICE": "cpu",
            "PIANOLA_TRUST_PROXY": "True",
        }
    )
    assert settings.checkpoint_path == Path("/m/c.pth")
    assert settings.work_dir == Path("/data/work")
    assert settings.proxy_url == "socks5h://10.8.0.2:1080"
    assert settings.max_duration_s == 300.0
    assert settings.trust_proxy is True


def test_blocked_video_ids_are_parsed_from_a_comma_list() -> None:
    assert Settings.from_env({}).blocked_video_ids == frozenset()
    settings = Settings.from_env({"PIANOLA_BLOCKED_VIDEO_IDS": " abc , def,,"})
    assert settings.blocked_video_ids == frozenset({"abc", "def"})


def test_empty_proxy_means_no_proxy() -> None:
    assert Settings.from_env({"PIANOLA_PROXY_URL": ""}).proxy_url is None


def test_the_production_app_assembles_and_rejects_a_bad_link(tmp_path: Path) -> None:
    app = create_production_app({"PIANOLA_WORK_DIR": str(tmp_path / "work")})
    assert (tmp_path / "work").is_dir()
    # no lifespan: the worker (and its models) is not started, and the link is refused first
    client = TestClient(app, raise_server_exceptions=False)
    response = client.post("/api/v1/jobs", json={"url": "https://example.com/not-youtube"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_url"


def test_midi_reader_returns_sorted_notes(tmp_path: Path) -> None:
    pretty_midi = pytest.importorskip("pretty_midi")
    from pianola.infrastructure.midi_reader import PrettyMidiReader

    midi = pretty_midi.PrettyMIDI()
    piano = pretty_midi.Instrument(program=0)
    piano.notes.append(pretty_midi.Note(velocity=70, pitch=64, start=1.0, end=1.5))
    piano.notes.append(pretty_midi.Note(velocity=80, pitch=60, start=0.5, end=1.0))
    drums = pretty_midi.Instrument(program=0, is_drum=True)
    drums.notes.append(pretty_midi.Note(velocity=90, pitch=36, start=0.0, end=0.1))
    midi.instruments.extend([piano, drums])
    path = tmp_path / "x.mid"
    midi.write(str(path))
    notes = PrettyMidiReader().read(path)
    assert [(n.pitch, n.start_s) for n in notes] == [(60, 0.5), (64, 1.0)]


def test_healthz_is_up_without_the_worker(tmp_path: Path) -> None:
    app = create_production_app({"PIANOLA_WORK_DIR": str(tmp_path)})
    response = TestClient(app).get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
