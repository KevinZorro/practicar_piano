"""Test doubles for the ports (no network, no models)."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import TypeVar

from pianola.application.ports import Measured
from pianola.domain.errors import DownloadError, TranscriptionError
from pianola.domain.models import AudioFile, ResourceUsage, SongSource, TranscriptionOutput
from pianola.domain.video_url import VideoUrl

T = TypeVar("T")


class FakeDownloader:
    def __init__(
        self,
        durations: dict[str, float] | None = None,
        failing_ids: frozenset[str] = frozenset(),
    ) -> None:
        self._durations = durations or {}
        self._failing_ids = failing_ids
        self.downloaded: list[Path] = []

    def download(self, source: SongSource, dest_dir: Path) -> AudioFile:
        key = source.video_id if isinstance(source, VideoUrl) else source.path.stem
        if key in self._failing_ids:
            raise DownloadError("blocked by fake")
        path = dest_dir / "audio.m4a"
        path.write_bytes(b"fake-audio")
        self.downloaded.append(path)
        return AudioFile(path=path, duration_seconds=self._durations.get(key, 180.0))


class FakeTranscriber:
    def __init__(self, name: str, *, fails: bool = False, notes: int = 100) -> None:
        self._name = name
        self._fails = fails
        self._notes = notes
        self.audio_seen: list[Path] = []

    @property
    def name(self) -> str:
        return self._name

    def transcribe(self, audio: AudioFile, midi_path: Path) -> TranscriptionOutput:
        self.audio_seen.append(audio.path)
        if self._fails:
            raise TranscriptionError("model exploded")
        midi_path.write_bytes(b"MThd")
        return TranscriptionOutput(note_count=self._notes, inference_seconds=30.0)


class FakeSynthesizer:
    def __init__(self) -> None:
        self.rendered: list[Path] = []

    def render(self, midi_path: Path, wav_path: Path) -> None:
        wav_path.write_bytes(b"RIFF")
        self.rendered.append(wav_path)


class InlineMeter:
    """Runs the work in-process and reports a fixed cost."""

    def __init__(self, usage: ResourceUsage = ResourceUsage(45.0, 900.0)) -> None:  # noqa: B008
        self._usage = usage

    def measure(self, work: Callable[[], T]) -> Measured[T]:
        return Measured(value=work(), usage=self._usage)
