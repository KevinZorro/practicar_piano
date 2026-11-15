from __future__ import annotations

import sys
import types
from pathlib import Path
from typing import Any

import pytest

from pianola.domain.errors import TranscriptionError
from pianola.domain.models import AudioFile
from pianola.infrastructure.bytedance_transcriber import ByteDanceTranscriber


def install_fake_package(monkeypatch: pytest.MonkeyPatch, calls: list[Any]) -> None:
    module = types.ModuleType("piano_transcription_inference")
    module.sample_rate = 16000  # type: ignore[attr-defined]

    def load_audio(path: str, sr: int, mono: bool) -> tuple[list[float], int]:
        calls.append(("load_audio", path, sr, mono))
        return [0.0] * 16000, sr

    class PianoTranscription:
        def __init__(self, device: str, checkpoint_path: str) -> None:
            calls.append(("init", device, checkpoint_path))

        def transcribe(self, audio: list[float], midi_path: str) -> dict[str, Any]:
            Path(midi_path).write_bytes(b"MThd")
            return {"est_note_events": [{}, {}, {}]}

    module.load_audio = load_audio  # type: ignore[attr-defined]
    module.PianoTranscription = PianoTranscription  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "piano_transcription_inference", module)


def fake_checkpoint(tmp_path: Path, size: int) -> Path:
    path = tmp_path / "model.pth"
    with path.open("wb") as handle:
        handle.truncate(size)
    return path


def test_transcribe_refuses_to_run_without_a_verified_checkpoint(tmp_path: Path) -> None:
    transcriber = ByteDanceTranscriber(checkpoint_path=tmp_path / "missing.pth")

    with pytest.raises(TranscriptionError, match="fetch_bytedance_checkpoint"):
        transcriber.transcribe(AudioFile(tmp_path / "a.wav", 10.0), tmp_path / "o.mid")


def test_transcribe_rejects_a_truncated_checkpoint(tmp_path: Path) -> None:
    transcriber = ByteDanceTranscriber(checkpoint_path=fake_checkpoint(tmp_path, 1_000))

    with pytest.raises(TranscriptionError, match="incomplete"):
        transcriber.transcribe(AudioFile(tmp_path / "a.wav", 10.0), tmp_path / "o.mid")


def test_transcribe_passes_the_explicit_checkpoint_and_reports_notes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[Any] = []
    install_fake_package(monkeypatch, calls)
    checkpoint = fake_checkpoint(tmp_path, 170_000_000)
    transcriber = ByteDanceTranscriber(checkpoint_path=checkpoint)

    output = transcriber.transcribe(AudioFile(tmp_path / "a.wav", 10.0), tmp_path / "o.mid")

    assert output.note_count == 3
    assert output.inference_seconds >= 0
    assert ("init", "cpu", str(checkpoint)) in calls
    assert (tmp_path / "o.mid").exists()


def test_transcribe_translates_library_failures(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setitem(sys.modules, "piano_transcription_inference", None)  # import fails
    transcriber = ByteDanceTranscriber(checkpoint_path=fake_checkpoint(tmp_path, 170_000_000))

    with pytest.raises(TranscriptionError, match="bytedance failed"):
        transcriber.transcribe(AudioFile(tmp_path / "a.wav", 10.0), tmp_path / "o.mid")
