"""The real CLI on local audio: ffmpeg conversion, Basic Pitch in a child process, report."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from pianola.cli.main import main
from pianola.infrastructure.synthesizer import AdditiveSynthesizer
from tests.integration.test_basic_pitch_public_domain import write_reference_midi

pytest.importorskip("pretty_midi")
pytest.importorskip("basic_pitch")

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg"),
]


def test_cli_transcribes_a_local_public_domain_file_end_to_end(tmp_path: Path) -> None:
    audio_dir, out = tmp_path / "audio", tmp_path / "out"
    audio_dir.mkdir()
    write_reference_midi(tmp_path / "ode.mid")
    AdditiveSynthesizer().render(tmp_path / "ode.mid", audio_dir / "ode-to-joy.wav")

    code = main(
        [
            "phase0",
            "run",
            "--audio-dir",
            str(audio_dir),
            "--out",
            str(out),
            "--models",
            "basic-pitch",
        ]
    )

    assert code == 0
    songs = json.loads((out / "results.json").read_text())["songs"]
    run = songs[0]["runs"][0]
    assert run["error"] is None
    assert run["note_count"] > 0
    assert Path(run["wav_path"]).stat().st_size > 1000
    assert (audio_dir / "ode-to-joy.wav").exists()
    assert not (out / ".work").exists()
    assert "ode-to-joy" in (out / "report.md").read_text()
