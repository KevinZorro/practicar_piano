from __future__ import annotations

import subprocess
import wave
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from teclario.domain.errors import DownloadError, DurationLimitExceededError
from teclario.domain.models import LocalAudio
from teclario.domain.video_url import VideoUrl
from teclario.infrastructure.local_audio import LocalAudioImporter, discover_audio_files


def write_wav(path: Path, seconds: float) -> None:
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(44100)
        handle.writeframes(b"\x00\x00" * int(44100 * seconds))


def fake_ffmpeg(seconds: float, *, returncode: int = 0, stderr: str = "") -> Any:
    calls: list[list[str]] = []

    def runner(command: list[str], **kwargs: Any) -> SimpleNamespace:
        calls.append(command)
        if returncode == 0:
            write_wav(Path(command[-1]), seconds)
        return SimpleNamespace(returncode=returncode, stderr=stderr)

    runner.calls = calls  # type: ignore[attr-defined]
    return runner


def test_import_converts_a_copy_and_reports_the_duration(tmp_path: Path) -> None:
    source = tmp_path / "song.mp3"
    source.write_bytes(b"original")
    runner = fake_ffmpeg(2.0)

    audio = LocalAudioImporter(max_duration_seconds=600, runner=runner).download(
        LocalAudio(source), tmp_path / "work"
    )

    assert audio.path == tmp_path / "work" / "audio.wav"
    assert audio.duration_seconds == pytest.approx(2.0)
    assert source.read_bytes() == b"original", "the user's file is never touched"
    command = runner.calls[0]
    assert command[command.index("-ac") + 1] == "1"
    assert command[command.index("-ar") + 1] == "44100"
    assert str(source.resolve()) in command


def test_import_rejects_files_over_the_duration_limit(tmp_path: Path) -> None:
    importer = LocalAudioImporter(max_duration_seconds=1.0, runner=fake_ffmpeg(3.0))

    with pytest.raises(DurationLimitExceededError, match="exceeds limit"):
        importer.download(LocalAudio(tmp_path / "x.wav"), tmp_path / "work")


def test_import_reports_the_first_line_of_ffmpeg_errors(tmp_path: Path) -> None:
    runner = fake_ffmpeg(0, returncode=1, stderr="Invalid data found\nmore noise\n")

    with pytest.raises(DownloadError, match="Invalid data found") as caught:
        LocalAudioImporter(max_duration_seconds=600, runner=runner).download(
            LocalAudio(tmp_path / "x.mp3"), tmp_path / "work"
        )

    assert "more noise" not in str(caught.value)


def test_import_reports_a_missing_ffmpeg(tmp_path: Path) -> None:
    def runner(command: list[str], **kwargs: Any) -> None:
        raise FileNotFoundError("ffmpeg")

    with pytest.raises(DownloadError, match="could not run"):
        LocalAudioImporter(max_duration_seconds=600, runner=runner).download(
            LocalAudio(tmp_path / "x.mp3"), tmp_path / "work"
        )


def test_import_times_out_cleanly(tmp_path: Path) -> None:
    def runner(command: list[str], **kwargs: Any) -> None:
        raise subprocess.TimeoutExpired(command, 1)

    with pytest.raises(DownloadError, match="TimeoutExpired"):
        LocalAudioImporter(max_duration_seconds=600, runner=runner).download(
            LocalAudio(tmp_path / "x.mp3"), tmp_path / "work"
        )


def test_import_refuses_youtube_links(tmp_path: Path) -> None:
    importer = LocalAudioImporter(max_duration_seconds=600, runner=fake_ffmpeg(1.0))

    with pytest.raises(DownloadError, match="only handles local"):
        importer.download(VideoUrl.parse("https://youtu.be/aaaaaaaaaaa"), tmp_path)


def test_discover_audio_files_filters_by_extension_and_sorts_by_name(tmp_path: Path) -> None:
    for name in ("b.MP3", "a.wav", "notes.txt", "c.m4a", ".hidden"):
        (tmp_path / name).write_bytes(b"x")
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "d.wav").write_bytes(b"x")

    assert [p.name for p in discover_audio_files(tmp_path)] == ["a.wav", "b.MP3", "c.m4a"]


def test_local_audio_repr_and_fingerprint_hide_the_file_name() -> None:
    audio = LocalAudio(Path("/music/Secret Song.mp3"))

    assert "Secret" not in repr(audio)
    assert len(audio.fingerprint) == 10
